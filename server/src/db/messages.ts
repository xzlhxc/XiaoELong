import type { ChatMessage } from "@xiaoelong/shared";
import type { ResultSetHeader } from "mysql2";
import { mapMessageWithUserRow, type MessageWithUserRow } from "./mappers.js";
import { pool } from "./pool.js";

const MESSAGE_WITH_USER_SELECT = `
  SELECT
    m.id,
    m.content,
    m.created_at,
    u.id AS user_id,
    u.nickname,
    u.avatar_url,
    u.created_at AS user_created_at
  FROM messages m
  INNER JOIN users u ON u.id = m.user_id
`;

export async function createMessage(userId: string, content: string): Promise<ChatMessage> {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO messages (user_id, content) VALUES (?, ?)",
    [userId, content]
  );

  const [rows] = await pool.query<MessageWithUserRow[]>(
    `${MESSAGE_WITH_USER_SELECT} WHERE m.id = ? LIMIT 1`,
    [result.insertId]
  );

  if (rows.length === 0) {
    throw new Error("Failed to load created message.");
  }

  return mapMessageWithUserRow(rows[0]);
}

export async function getRecentMessages(limit: number): Promise<ChatMessage[]> {
  const [rows] = await pool.query<MessageWithUserRow[]>(
    `${MESSAGE_WITH_USER_SELECT} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    [limit]
  );

  return rows.reverse().map(mapMessageWithUserRow);
}
