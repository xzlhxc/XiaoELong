import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { env } from "../config/env.js";

const messageSchema = z.string().trim().min(1).max(env.MAX_MESSAGE_LENGTH);

export interface NormalizedMessage {
  ok: true;
  content: string;
}

export interface InvalidMessage {
  ok: false;
  error: string;
}

export type MessageValidationResult = NormalizedMessage | InvalidMessage;

export function normalizeChatContent(input: unknown): MessageValidationResult {
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

  if (!sanitized) {
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
