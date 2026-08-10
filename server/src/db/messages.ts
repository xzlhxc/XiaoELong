import type { ChatFile, ChatImage, ChatMessage } from "@xiaoelong/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { mapMessageWithUserRow, type MessageWithUserRow } from "./mappers.js";
import { pool } from "./pool.js";

const MESSAGE_WITH_USER_SELECT = `
  SELECT
    m.id,
    m.content,
    m.image_url,
    m.image_name,
    m.image_mime_type,
    m.image_size,
    m.file_url,
    m.file_name,
    m.file_mime_type,
    m.file_size,
    m.created_at,
    u.id AS user_id,
    u.nickname,
    u.avatar_url,
    u.created_at AS user_created_at,
    reply_m.id AS reply_id,
    reply_m.content AS reply_content,
    reply_m.image_url AS reply_image_url,
    reply_m.image_name AS reply_image_name,
    reply_m.image_mime_type AS reply_image_mime_type,
    reply_m.image_size AS reply_image_size,
    reply_m.file_url AS reply_file_url,
    reply_m.file_name AS reply_file_name,
    reply_m.file_mime_type AS reply_file_mime_type,
    reply_m.file_size AS reply_file_size,
    reply_m.created_at AS reply_created_at,
    reply_u.id AS reply_user_id,
    reply_u.nickname AS reply_user_nickname,
    reply_u.avatar_url AS reply_user_avatar_url,
    reply_u.created_at AS reply_user_created_at
  FROM messages m
  INNER JOIN users u ON u.id = m.user_id
  LEFT JOIN messages reply_m ON reply_m.id = m.reply_to_message_id
  LEFT JOIN users reply_u ON reply_u.id = reply_m.user_id
`;

interface CreateMessageInput {
  content: string;
  image: ChatImage | null;
  file: ChatFile | null;
  replyToMessageId: number | null;
}

interface MessageExistsRow extends RowDataPacket {
  id: number;
}

export async function createMessage(userId: string, input: CreateMessageInput): Promise<ChatMessage> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO messages (
       user_id,
       content,
       image_url,
       image_name,
       image_mime_type,
       image_size,
       file_url,
       file_name,
       file_mime_type,
       file_size,
       reply_to_message_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      input.content,
      input.image?.url ?? null,
      input.image?.name ?? null,
      input.image?.mimeType ?? null,
      input.image?.size ?? null,
      input.file?.url ?? null,
      input.file?.name ?? null,
      input.file?.mimeType ?? null,
      input.file?.size ?? null,
      input.replyToMessageId
    ]
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

export async function messageExists(messageId: number): Promise<boolean> {
  const [rows] = await pool.query<MessageExistsRow[]>(
    "SELECT id FROM messages WHERE id = ? LIMIT 1",
    [messageId]
  );
  return rows.length > 0;
}

export async function getRecentMessages(limit: number): Promise<ChatMessage[]> {
  const [rows] = await pool.query<MessageWithUserRow[]>(
    `${MESSAGE_WITH_USER_SELECT} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    [limit]
  );

  return rows.reverse().map(mapMessageWithUserRow);
}
