import type { DailyMood, MoodEmoji } from "@xiaoelong/shared";
import { MOOD_OPTIONS } from "@xiaoelong/shared";
import type { RowDataPacket } from "mysql2";
import { pool } from "./pool.js";
import { getResetDayInTimezone, toIsoString } from "../utils/time.js";

const MOOD_TIMEZONE = "Asia/Shanghai";
const MOOD_RESET_HOUR = 8;

interface DailyMoodRow extends RowDataPacket {
  user_id: string;
  mood_day: string;
  emoji: string;
  updated_at: Date | string;
}

export function getCurrentMoodDay(now = new Date()): string {
  return getResetDayInTimezone(now, MOOD_TIMEZONE, MOOD_RESET_HOUR);
}

export function isMoodEmoji(value: unknown): value is MoodEmoji {
  return typeof value === "string" && (MOOD_OPTIONS as readonly string[]).includes(value);
}

function mapDailyMoodRow(row: DailyMoodRow): DailyMood {
  return {
    userId: row.user_id,
    moodDay: String(row.mood_day).slice(0, 10),
    emoji: row.emoji as MoodEmoji,
    updatedAt: toIsoString(row.updated_at)
  };
}

export async function getDailyMoodForUser(userId: string, moodDay = getCurrentMoodDay()): Promise<DailyMood | null> {
  const [rows] = await pool.query<DailyMoodRow[]>(
    `SELECT user_id, mood_day, emoji, updated_at
     FROM daily_moods
     WHERE user_id = ? AND mood_day = ?
     LIMIT 1`,
    [userId, moodDay]
  );

  return rows.length > 0 ? mapDailyMoodRow(rows[0]) : null;
}

export async function listDailyMoodsByUserId(moodDay = getCurrentMoodDay()): Promise<Map<string, DailyMood>> {
  const [rows] = await pool.query<DailyMoodRow[]>(
    `SELECT user_id, mood_day, emoji, updated_at
     FROM daily_moods
     WHERE mood_day = ?`,
    [moodDay]
  );

  return new Map(rows.map((row) => [row.user_id, mapDailyMoodRow(row)]));
}

export async function setDailyMoodForUser(
  userId: string,
  emoji: MoodEmoji,
  moodDay = getCurrentMoodDay()
): Promise<DailyMood> {
  await pool.execute(
    `INSERT INTO daily_moods (user_id, mood_day, emoji)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), updated_at = CURRENT_TIMESTAMP`,
    [userId, moodDay, emoji]
  );

  const mood = await getDailyMoodForUser(userId, moodDay);
  if (!mood) {
    throw new Error("Daily mood update failed.");
  }

  return mood;
}
