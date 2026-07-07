import type { ChatFile, ChatImage } from "@xiaoelong/shared";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { env } from "../config/env.js";

export const ALLOWED_CHAT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const BLOCKED_CHAT_FILE_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".js",
  ".msi",
  ".ps1",
  ".scr",
  ".vbs"
]);

const messageSchema = z.string().trim().max(env.MAX_MESSAGE_LENGTH);
const chatImageSchema = z.object({
  url: z.string().trim().regex(/^\/uploads\/chat-images\/[^/]+$/),
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_CHAT_IMAGE_MIME_TYPES),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(env.MAX_CHAT_IMAGE_SIZE_MB * 1024 * 1024)
});
const chatFileSchema = z.object({
  url: z.string().trim().regex(/^\/uploads\/chat-files\/[^/]+$/),
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(env.MAX_CHAT_FILE_SIZE_MB * 1024 * 1024)
});

export interface NormalizedMessage {
  ok: true;
  content: string;
}

export interface InvalidMessage {
  ok: false;
  error: string;
}

export type MessageValidationResult = NormalizedMessage | InvalidMessage;

export function isAllowedChatImageMimeType(value: string): boolean {
  return (ALLOWED_CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function isAllowedChatFileName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !Array.from(BLOCKED_CHAT_FILE_EXTENSIONS).some((extension) => normalized.endsWith(extension));
}

export function normalizeChatContent(input: unknown, options: { allowEmpty?: boolean } = {}): MessageValidationResult {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Message must be 1-${env.MAX_MESSAGE_LENGTH} characters.`
    };
  }

  const sanitized = sanitizeHtml(parsed.data, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();

  if (!sanitized && !options.allowEmpty) {
    return {
      ok: false,
      error: "Message cannot be empty after sanitization."
    };
  }

  if (sanitized.length > env.MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be 1-${env.MAX_MESSAGE_LENGTH} characters.`
    };
  }

  return {
    ok: true,
    content: sanitized
  };
}

export function normalizeChatImage(input: unknown): { ok: true; image: ChatImage } | InvalidMessage {
  const parsed = chatImageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid chat image."
    };
  }

  const safeName =
    sanitizeHtml(parsed.data.name, {
      allowedTags: [],
      allowedAttributes: {}
    }).trim() || "image";

  return {
    ok: true,
    image: {
      url: parsed.data.url,
      name: safeName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size
    }
  };
}

export function normalizeChatFile(input: unknown): { ok: true; file: ChatFile } | InvalidMessage {
  const parsed = chatFileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid chat file."
    };
  }

  const safeName =
    sanitizeHtml(parsed.data.name, {
      allowedTags: [],
      allowedAttributes: {}
    }).trim() || "file";

  if (!isAllowedChatFileName(safeName)) {
    return {
      ok: false,
      error: "This file type is not allowed."
    };
  }

  return {
    ok: true,
    file: {
      url: parsed.data.url,
      name: safeName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size
    }
  };
}
