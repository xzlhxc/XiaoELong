import { Router } from "express";
import { z } from "zod";
import { getRecentMessages } from "../db/messages.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50)
});

router.get("/messages", requireAuth, async (req, res, next) => {
  const parsed = querySchema.safeParse({
    limit: req.query.limit ?? 50
  });

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid limit query." });
    return;
  }

  try {
    const messages = await getRecentMessages(parsed.data.limit);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

export default router;
