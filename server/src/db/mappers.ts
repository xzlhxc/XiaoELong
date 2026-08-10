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
  reply_id: number | null;
  reply_content: string | null;
  reply_image_url: string | null;
  reply_image_name: string | null;
  reply_image_mime_type: string | null;
  reply_image_size: number | string | null;
  reply_file_url: string | null;
  reply_file_name: string | null;
  reply_file_mime_type: string | null;
  reply_file_size: number | string | null;
  reply_created_at: Date | string | null;
  reply_user_id: string | null;
  reply_user_nickname: string | null;
  reply_user_avatar_url: string | null;
  reply_user_created_at: Date | string | null;
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
    },
    replyTo: row.reply_id !== null
      && row.reply_created_at !== null
      && row.reply_user_id !== null
      && row.reply_user_nickname !== null
      && row.reply_user_created_at !== null
      ? {
          id: row.reply_id,
          content: row.reply_content ?? "",
          image: row.reply_image_url
            ? {
                url: row.reply_image_url,
                name: row.reply_image_name ?? "image",
                mimeType: row.reply_image_mime_type ?? "application/octet-stream",
                size: row.reply_image_size === null ? 0 : Number(row.reply_image_size)
              }
            : null,
          file: row.reply_file_url
            ? {
                url: row.reply_file_url,
                name: row.reply_file_name ?? "file",
                mimeType: row.reply_file_mime_type ?? "application/octet-stream",
                size: row.reply_file_size === null ? 0 : Number(row.reply_file_size)
              }
            : null,
          createdAt: toIsoString(row.reply_created_at),
          user: {
            id: row.reply_user_id,
            nickname: row.reply_user_nickname,
            avatarUrl: row.reply_user_avatar_url,
            createdAt: toIsoString(row.reply_user_created_at)
          }
        }
      : null
  };
}
