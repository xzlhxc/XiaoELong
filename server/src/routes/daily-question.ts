import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import type { ClientToServerEvents, DailyQuestionUpdatePayload, ServerToClientEvents } from "@xiaoelong/shared";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import {
  DailyQuestionService,
  DailyQuestionUnavailableError,
  DailyQuestionValidationError
} from "../services/daily-question-service.js";

const submitAnswerSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  answerIndex: z.coerce.number().int().nonnegative()
});

const statsQuerySchema = z.object({
  questionId: z.coerce.number().int().positive()
});

const developmentPreviewSchema = z.object({
  preferredSource: z.enum(["logiqa2", "cmmlu", "raven_style"]).optional(),
  excludedBankQuestionIds: z.array(z.number().int().positive()).max(2000).default([])
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
      if (error instanceof DailyQuestionUnavailableError) {
        res.status(503).json({ message: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/dev/next", requireAuth, async (req, res, next) => {
    if (env.NODE_ENV !== "development") {
      res.status(404).json({ message: "Not found." });
      return;
    }
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    const parsed = developmentPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid question-bank preview request." });
      return;
    }

    try {
      res.json(await service.getNextDevelopmentPreview(
        parsed.data.preferredSource,
        parsed.data.excludedBankQuestionIds
      ));
    } catch (error) {
      if (error instanceof DailyQuestionValidationError) {
        res.status(404).json({ message: error.message });
        return;
      }
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
