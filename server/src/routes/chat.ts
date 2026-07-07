import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { env } from "../config/env.js";
import { getRecentMessages } from "../db/messages.js";
import { requireAuth } from "../middleware/auth.js";
import { isAllowedChatFileName, isAllowedChatImageMimeType } from "../utils/chat.js";
import { chatFileDir, chatImageDir } from "../utils/uploads.js";

const router = Router();

function getExtensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  return path.extname(mimeType) || ".img";
}

function getSafeOriginalName(originalName: string): string {
  const basename = path.basename(originalName || "image");
  return (
    sanitizeHtml(basename, {
      allowedTags: [],
      allowedAttributes: {}
    })
      .trim()
      .slice(0, 255) || "image"
  );
}

const chatImageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, chatImageDir);
  },
  filename(_req, file, cb) {
    cb(null, `${randomUUID()}${getExtensionForMimeType(file.mimetype)}`);
  }
});

const chatImageUpload = multer({
  storage: chatImageStorage,
  limits: {
    fileSize: env.MAX_CHAT_IMAGE_SIZE_MB * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedChatImageMimeType(file.mimetype)) {
      cb(new Error("Chat image must be a jpg, png, webp, or gif file."));
      return;
    }
    cb(null, true);
  }
});

function getExtensionForOriginalName(originalName: string): string {
  const extension = path.extname(originalName || "").toLowerCase();
  return extension && extension.length <= 16 ? extension : ".bin";
}

const chatFileStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, chatFileDir);
  },
  filename(_req, file, cb) {
    cb(null, `${randomUUID()}${getExtensionForOriginalName(file.originalname)}`);
  }
});

const chatFileUpload = multer({
  storage: chatFileStorage,
  limits: {
    fileSize: env.MAX_CHAT_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedChatFileName(file.originalname)) {
      cb(new Error("Chat file type is not allowed."));
      return;
    }
    cb(null, true);
  }
});

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

router.post("/images", requireAuth, chatImageUpload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "Image file is required." });
    return;
  }

  res.status(201).json({
    image: {
      url: `/uploads/chat-images/${req.file.filename}`,
      name: getSafeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      size: req.file.size
    }
  });
});

router.post("/files", requireAuth, chatFileUpload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "File is required." });
    return;
  }

  res.status(201).json({
    file: {
      url: `/uploads/chat-files/${req.file.filename}`,
      name: getSafeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size
    }
  });
});

export default router;
