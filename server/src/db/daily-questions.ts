import type { DailyQuestion, DailyQuestionStats } from "@xiaoelong/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./pool.js";
import { toIsoString } from "../utils/time.js";

interface DailyQuestionRow extends RowDataPacket {
  id: number;
  date: Date | string;
  question: string;
  options: string | string[];
  source_type: "online" | "fallback" | "manual";
  source_context: string | null;
  created_at: Date | string;
}

interface DailyAnswerRow extends RowDataPacket {
  answer_index: number;
  count: number;
}

interface DailyAnswerByUserRow extends RowDataPacket {
  answer_index: number;
}

interface CreateDailyQuestionInput {
  date: string;
  question: string;
  options: string[];
  sourceType: "online" | "fallback" | "manual";
  sourceContext: string | null;
}

function parseOptions(raw: string | string[]): string[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((option) => String(option));
  } catch {
    return [];
  }
}

function mapDailyQuestion(row: DailyQuestionRow): DailyQuestion {
  const questionDate = row.date instanceof Date ? toIsoString(row.date).slice(0, 10) : String(row.date);
  return {
    id: row.id,
    date: questionDate,
    question: row.question,
    options: parseOptions(row.options),
    sourceType: row.source_type,
    sourceContext: row.source_context,
    createdAt: toIsoString(row.created_at)
  };
}

export async function getDailyQuestionByDate(date: string): Promise<DailyQuestion | null> {
  const [rows] = await pool.query<DailyQuestionRow[]>(
    `SELECT id, date, question, options, source_type, source_context, created_at
     FROM daily_questions
     WHERE date = ?
     LIMIT 1`,
    [date]
  );

  if (rows.length === 0) {
    return null;
  }
  return mapDailyQuestion(rows[0]);
}

export async function getDailyQuestionById(id: number): Promise<DailyQuestion | null> {
  const [rows] = await pool.query<DailyQuestionRow[]>(
    `SELECT id, date, question, options, source_type, source_context, created_at
     FROM daily_questions
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }
  return mapDailyQuestion(rows[0]);
}

export async function createDailyQuestion(input: CreateDailyQuestionInput): Promise<DailyQuestion> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO daily_questions (date, question, options, source_type, source_context)
     VALUES (?, ?, ?, ?, ?)`,
    [input.date, input.question, JSON.stringify(input.options), input.sourceType, input.sourceContext]
  );

  const created = await getDailyQuestionById(result.insertId);
  if (!created) {
    throw new Error("Failed to create daily question.");
  }
  return created;
}

export async function getLatestOnlineDailyQuestion(beforeDate?: string): Promise<DailyQuestion | null> {
  const params: unknown[] = [];
  let whereClause = "WHERE source_type = 'online'";
  if (beforeDate) {
    whereClause += " AND date < ?";
    params.push(beforeDate);
  }

  const [rows] = await pool.query<DailyQuestionRow[]>(
    `SELECT id, date, question, options, source_type, source_context, created_at
     FROM daily_questions
     ${whereClause}
     ORDER BY date DESC, id DESC
     LIMIT 1`,
    params
  );

  if (rows.length === 0) {
    return null;
  }
  return mapDailyQuestion(rows[0]);
}

export async function getDailyQuestionStats(questionId: number, optionCount: number): Promise<DailyQuestionStats> {
  const [rows] = await pool.query<DailyAnswerRow[]>(
    `SELECT answer_index, COUNT(*) AS count
     FROM daily_answers
     WHERE question_id = ?
     GROUP BY answer_index`,
    [questionId]
  );

  const counts = Array.from({ length: optionCount }, () => 0);
  for (const row of rows) {
    if (row.answer_index >= 0 && row.answer_index < optionCount) {
      counts[row.answer_index] = Number(row.count);
    }
  }

  return {
    questionId,
    counts,
    totalAnswers: counts.reduce((sum, count) => sum + count, 0)
  };
}

export async function getDailyAnswerIndexByUser(questionId: number, userId: string): Promise<number | null> {
  const [rows] = await pool.query<DailyAnswerByUserRow[]>(
    `SELECT answer_index
     FROM daily_answers
     WHERE question_id = ? AND user_id = ?
     LIMIT 1`,
    [questionId, userId]
  );

  if (rows.length === 0) {
    return null;
  }
  return rows[0].answer_index;
}

export async function submitDailyAnswer(questionId: number, userId: string, answerIndex: number): Promise<void> {
  await pool.execute(
    `INSERT INTO daily_answers (question_id, user_id, answer_index)
     VALUES (?, ?, ?)`,
    [questionId, userId, answerIndex]
  );
}
