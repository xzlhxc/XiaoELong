import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

export const uploadRoot = path.resolve(env.UPLOAD_ROOT || path.resolve(process.cwd(), "uploads"));
export const avatarDir = path.join(uploadRoot, "avatars");
export const chatImageDir = path.join(uploadRoot, "chat-images");
export const chatFileDir = path.join(uploadRoot, "chat-files");

export function ensureUploadDirs(): void {
  mkdirSync(avatarDir, { recursive: true });
  mkdirSync(chatImageDir, { recursive: true });
  mkdirSync(chatFileDir, { recursive: true });
}

export function resolveAvatarPath(avatarUrl: string | null): string | null {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) {
    return null;
  }

  const fileName = path.basename(avatarUrl);
  if (!fileName) {
    return null;
  }

  return path.join(avatarDir, fileName);
}
