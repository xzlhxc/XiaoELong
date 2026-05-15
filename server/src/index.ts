import { mkdirSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import cors from "cors";
import express from "express";
import multer from "multer";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@xiaoelong/shared";
import { env } from "./config/env.js";
import authRouter from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import { createDailyQuestionRouter } from "./routes/daily-question.js";
import { createGomokuRouter } from "./routes/gomoku.js";
import { startQuestionScheduler } from "./jobs/question-scheduler.js";
import { DailyQuestionService } from "./services/daily-question-service.js";
import { GomokuService } from "./services/gomoku-service.js";
import { setupSocket } from "./socket/index.js";

const app = express();
const server = http.createServer(app);

const uploadRoot = path.resolve(process.cwd(), "uploads");
const avatarRoot = path.join(uploadRoot, "avatars");
mkdirSync(avatarRoot, { recursive: true });

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadRoot));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: env.CLIENT_ORIGIN,
    credentials: true
  }
});

const dailyQuestionService = new DailyQuestionService();
const gomokuService = new GomokuService();

app.use("/api/daily-question", createDailyQuestionRouter(io, dailyQuestionService));
app.use("/api/gomoku", createGomokuRouter(io, gomokuService));

setupSocket(io, { gomokuService });

void dailyQuestionService
  .ensureTodayQuestion()
  .then((question) => {
    console.log(`[DailyQuestion] ensured ${question.date} (${question.sourceType}).`);
  })
  .catch((error) => {
    console.error("[DailyQuestion] startup ensure failed:", error);
  });

startQuestionScheduler(dailyQuestionService);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error instanceof Error) {
    if (error.message === "Avatar must be an image file.") {
      res.status(400).json({ message: error.message });
      return;
    }
    console.error(error.message);
  } else {
    console.error("Unknown server error:", error);
  }

  res.status(500).json({ message: "Internal server error." });
});

server.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
