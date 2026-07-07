import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import {
  MOOD_OPTIONS,
  type ClientToServerEvents,
  type DailyMoodUpdatePayload,
  type ServerToClientEvents
} from "@xiaoelong/shared";
import {
  getCurrentMoodDay,
  getDailyMoodForUser,
  isMoodEmoji,
  setDailyMoodForUser
} from "../db/daily-moods.js";
import { requireAuth } from "../middleware/auth.js";

const setMoodSchema = z.object({
  emoji: z.string().refine(isMoodEmoji)
});

export function createDailyMoodRouter(io: Server<ClientToServerEvents, ServerToClientEvents>): Router {
  const router = Router();

  router.get("/today", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    try {
      const moodDay = getCurrentMoodDay();
      const mood = await getDailyMoodForUser(req.user.id, moodDay);
      res.json({
        moodDay,
        mood,
        options: [...MOOD_OPTIONS],
        shouldPrompt: mood === null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    const parsed = setMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid mood payload." });
      return;
    }

    try {
      const moodDay = getCurrentMoodDay();
      const mood = await setDailyMoodForUser(req.user.id, parsed.data.emoji as (typeof MOOD_OPTIONS)[number], moodDay);
      const updatePayload: DailyMoodUpdatePayload = {
        userId: req.user.id,
        mood
      };
      io.emit("mood:update", updatePayload);

      res.json({
        ok: true,
        moodDay,
        mood
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
