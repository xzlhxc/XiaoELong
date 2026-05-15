import type { ChatMessage, UserProfile } from "@xiaoelong/shared";
import type { RowDataPacket } from "mysql2";

export interface UserRow extends RowDataPacket {
  id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: Date | string;
}

export interface MessageWithUserRow extends RowDataPacket {
  id: number;
  content: string;
  created_at: Date | string;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  user_created_at: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
    createdAt: toIsoString(row.created_at),
    user: {
      id: row.user_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      createdAt: toIsoString(row.user_created_at)
    }
  };
}
