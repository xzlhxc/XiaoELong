import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { ClientToServerEvents, ServerToClientEvents } from "@xiaoelong/shared";
import type { Server } from "socket.io";
import multer from "multer";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { env } from "../config/env.js";
import { createUser, deleteUserById } from "../db/users.js";
import { requireAuth } from "../middleware/auth.js";
import { listPresenceUsers } from "../socket/index.js";
import { avatarDir, ensureUploadDirs, resolveAvatarPath } from "../utils/uploads.js";
import { signAccessToken } from "../utils/jwt.js";

const router = Router();

ensureUploadDirs();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, avatarDir);
  },
  filename(_req, file, cb) {
    const extension = path.extname(file.originalname) || ".png";
    cb(null, `${randomUUID()}${extension.toLowerCase()}`);
  }
});

const avatarUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_AVATAR_SIZE_MB * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Avatar must be an image file."));
      return;
    }
    cb(null, true);
  }
});

const joinSchema = z.object({
  inviteCode: z.string().trim().min(1),
  nickname: z.string().trim().min(1).max(32)
});

async function safeDelete(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Keep request flow stable when cleanup fails.
  }
}

router.post("/join", avatarUpload.single("avatar"), async (req, res, next) => {
  const parsed = joinSchema.safeParse({
    inviteCode: req.body.inviteCode,
    nickname: req.body.nickname
  });

  if (!parsed.success) {
    if (req.file) {
      await safeDelete(req.file.path);
    }
    res.status(400).json({ message: "Invalid inviteCode or nickname." });
    return;
  }

  if (parsed.data.inviteCode !== env.INVITE_CODE) {
    if (req.file) {
      await safeDelete(req.file.path);
    }
    res.status(401).json({ message: "Invalid invite code." });
    return;
  }

  const safeNickname = sanitizeHtml(parsed.data.nickname, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();

  if (!safeNickname) {
    if (req.file) {
      await safeDelete(req.file.path);
    }
    res.status(400).json({ message: "Nickname is required." });
    return;
  }

  try {
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    const user = await createUser({
      nickname: safeNickname,
      avatarUrl
    });
    const accessToken = signAccessToken(user.id);

    res.status(201).json({
      accessToken,
      user
    });
  } catch (error) {
    if (req.file) {
      await safeDelete(req.file.path);
    }
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  res.json({ user: req.user });
});

export function createAuthRouter(io: Server<ClientToServerEvents, ServerToClientEvents>): Router {
  router.delete("/me", requireAuth, async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    const deletedUserId = req.user.id;
    const avatarPath = resolveAvatarPath(req.user.avatarUrl);

    try {
      const deleted = await deleteUserById(deletedUserId);
      if (!deleted) {
        res.status(404).json({ message: "User not found." });
        return;
      }

      if (avatarPath) {
        await safeDelete(avatarPath);
      }

      io.in(`user:${deletedUserId}`).disconnectSockets(true);
      io.emit("presence:init", {
        users: await listPresenceUsers()
      });

      res.json({ ok: true, deletedUserId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default router;
