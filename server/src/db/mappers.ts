import type { ChatMessage, UserProfile } from "@xiaoelong/shared";
import type { RowDataPacket } from "mysql2";
import { toIsoString } from "../utils/time.js";

export interface UserRow extends RowDataPacket {
  id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: Date | string;
}

export interface MessageWithUserRow extends RowDataPacket {
  id: number;
  content: string;
  image_url: string | null;
  image_name: string | null;
  image_mime_type: string | null;
  image_size: number | string | null;
  file_url: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size: number | string | null;
  created_at: Date | string;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  user_created_at: Date | string;
}

export function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    createdAt: toIsoString(row.created_at)
  };
}

export function mapMessageWithUserRow(row: MessageWithUserRow): ChatMessage {
  return {
    id: row.id,
    content: row.content,
    image: row.image_url
      ? {
          url: row.image_url,
          name: row.image_name ?? "image",
          mimeType: row.image_mime_type ?? "application/octet-stream",
          size: row.image_size === null ? 0 : Number(row.image_size)
        }
      : null,
    file: row.file_url
      ? {
          url: row.file_url,
          name: row.file_name ?? "file",
          mimeType: row.file_mime_type ?? "application/octet-stream",
          size: row.file_size === null ? 0 : Number(row.file_size)
        }
      : null,
    createdAt: toIsoString(row.created_at),
    user: {
      id: row.user_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      createdAt: toIsoString(row.user_created_at)
    }
  };
}
