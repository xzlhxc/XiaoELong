import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthMeResponse, ClientToServerEvents, ServerToClientEvents } from "@xiaoelong/shared";
import type { Server } from "socket.io";
import multer from "multer";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { env } from "../config/env.js";
import { createUser, deleteUserById, updateUserProfile } from "../db/users.js";
import { requireAuth } from "../middleware/auth.js";
import { listPresenceUsers } from "../socket/index.js";
import { avatarDir, ensureUploadDirs, resolveAvatarPath } from "../utils/uploads.js";
import { shouldRefreshAccessToken, signAccessToken } from "../utils/jwt.js";

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

const profileSchema = z.object({
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
  if (!req.user || !req.accessTokenClaims) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  const response: AuthMeResponse = { user: req.user };
  res.set("Cache-Control", "private, no-store");
  if (
    shouldRefreshAccessToken(
      req.accessTokenClaims.exp,
      req.accessTokenClaims.sessionVersion,
      req.accessTokenClaims.iat
    )
  ) {
    response.accessToken = signAccessToken(req.user.id);
  }

  res.json(response);
});

export function createAuthRouter(io: Server<ClientToServerEvents, ServerToClientEvents>): Router {
  router.put("/me", requireAuth, avatarUpload.single("avatar"), async (req, res, next) => {
    if (!req.user) {
      if (req.file) {
        await safeDelete(req.file.path);
      }
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    const parsed = profileSchema.safeParse({
      nickname: req.body.nickname
    });

    if (!parsed.success) {
      if (req.file) {
        await safeDelete(req.file.path);
      }
      res.status(400).json({ message: "Invalid nickname." });
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

    const previousAvatarPath = resolveAvatarPath(req.user.avatarUrl);
    const nextAvatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : undefined;

    try {
      const user = await updateUserProfile(req.user.id, {
        nickname: safeNickname,
        ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {})
      });

      if (!user) {
        if (req.file) {
          await safeDelete(req.file.path);
        }
        res.status(404).json({ message: "User not found." });
        return;
      }

      if (req.file && previousAvatarPath && previousAvatarPath !== req.file.path) {
        await safeDelete(previousAvatarPath);
      }

      io.emit("user:update", { user });
      void listPresenceUsers()
        .then((users) => {
          io.emit("presence:init", { users });
        })
        .catch((error: unknown) => {
          console.error("[Auth] profile presence broadcast failed:", error);
        });

      res.json({ user });
    } catch (error) {
      if (req.file) {
        await safeDelete(req.file.path);
      }
      next(error);
    }
  });

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
