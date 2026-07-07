import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import type { ClientToServerEvents, DailyQuestionUpdatePayload, ServerToClientEvents } from "@xiaoelong/shared";
import { requireAuth } from "../middleware/auth.js";
import { DailyQuestionService, DailyQuestionValidationError } from "../services/daily-question-service.js";

const submitAnswerSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  answerIndex: z.coerce.number().int().nonnegative()
});

const statsQuerySchema = z.object({
  questionId: z.coerce.number().int().positive()
});

export function createDailyQuestionRouter(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  service: DailyQuestionService
): Router {
  const router = Router();

  router.get("/today", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    try {
      const payload = await service.getQuestionWithStatsForUser(req.user.id);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/answer", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    const parsed = submitAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid answer payload." });
      return;
    }

    try {
      const result = await service.submitAnswer(parsed.data.questionId, req.user.id, parsed.data.answerIndex);
      const updatePayload: DailyQuestionUpdatePayload = {
        questionId: result.question.id,
        stats: result.stats
      };
      io.emit("question:update", updatePayload);

      res.json({
        ok: true,
        stats: result.stats,
        answeredIndex: result.answeredIndex,
        result: result.result
      });
    } catch (error) {
      if (error instanceof DailyQuestionValidationError) {
        res.status(409).json({ message: error.message });
        return;
      }
      next(error);
    }
  });

  router.get("/stats", requireAuth, async (req, res, next) => {
    const parsed = statsQuerySchema.safeParse({
      questionId: req.query.questionId
    });

    if (!parsed.success) {
      res.status(400).json({ message: "Invalid questionId query." });
      return;
    }

    try {
      const stats = await service.getStats(parsed.data.questionId);
      res.json({ stats });
    } catch (error) {
      if (error instanceof DailyQuestionValidationError) {
        res.status(404).json({ message: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
