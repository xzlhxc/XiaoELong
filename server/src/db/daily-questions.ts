import type { DailyQuestion, DailyQuestionStats, DailyQuestionVisual, DailyQuestionVoter } from "@xiaoelong/shared";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./pool.js";
import { toIsoString } from "../utils/time.js";

export interface DailyQuestionRecord extends DailyQuestion {
  correctAnswerIndex: number;
  explanation: string;
  hasAnswerKey: boolean;
}

interface DailyQuestionRow extends RowDataPacket {
  id: number;
  date: Date | string;
  category: string | null;
  question: string;
  options: string | string[];
  visual_type: DailyQuestionVisual["type"] | null;
  visual_data: string | DailyQuestionVisual["data"] | null;
  correct_answer_index: number | null;
  explanation: string | null;
  source_type: "online" | "fallback" | "manual";
  source_context: string | null;
  created_at: Date | string;
}

interface DailyAnswerRow extends RowDataPacket {
  answer_index: number;
  count: number;
}

interface DailyAnswerVoterRow extends RowDataPacket {
  answer_index: number;
  answered_at: Date | string;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  user_created_at: Date | string;
}

interface DailyAnswerByUserRow extends RowDataPacket {
  answer_index: number;
}

interface CreateDailyQuestionInput {
  date: string;
  category: string;
  question: string;
  options: string[];
  visual: DailyQuestionVisual | null;
  correctAnswerIndex: number;
  explanation: string;
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

function parseVisual(
  visualType: DailyQuestionVisual["type"] | null,
  raw: string | DailyQuestionVisual["data"] | null
): DailyQuestionVisual | null {
  if (!visualType || raw === null) {
    return null;
  }

  try {
    const data = typeof raw === "string" ? (JSON.parse(raw) as DailyQuestionVisual["data"]) : raw;
    return {
      type: visualType,
      data
    } as DailyQuestionVisual;
  } catch {
    return null;
  }
}

function normalizeCorrectAnswerIndex(raw: number | null, optionCount: number): number {
  if (raw === null || raw < 0 || raw >= optionCount) {
    return 0;
  }
  return raw;
}

function mapDailyQuestion(row: DailyQuestionRow): DailyQuestionRecord {
  const options = parseOptions(row.options);
  const visual = parseVisual(row.visual_type, row.visual_data);
  const explanation = row.explanation?.trim() || "";
  const questionDate = row.date instanceof Date ? toIsoString(row.date).slice(0, 10) : String(row.date).slice(0, 10);
  return {
    id: row.id,
    date: questionDate,
    category: row.category || "综合",
    question: row.question,
    options,
    visual,
    correctAnswerIndex: normalizeCorrectAnswerIndex(row.correct_answer_index, options.length),
    explanation: explanation || "暂无解析。",
    hasAnswerKey: explanation.length > 0,
    sourceType: row.source_type,
    sourceContext: row.source_context,
    createdAt: toIsoString(row.created_at)
  };
}

export function toPublicDailyQuestion(question: DailyQuestionRecord): DailyQuestion {
  return {
    id: question.id,
    date: question.date,
    category: question.category,
    question: question.question,
    options: question.options,
    visual: question.visual,
    sourceType: question.sourceType,
    sourceContext: question.sourceContext,
    createdAt: question.createdAt
  };
}

export async function getDailyQuestionByDate(date: string): Promise<DailyQuestionRecord | null> {
  const [rows] = await pool.query<DailyQuestionRow[]>(
    `SELECT id, date, category, question, options, visual_type, visual_data, correct_answer_index, explanation, source_type, source_context, created_at
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

export async function getDailyQuestionById(id: number): Promise<DailyQuestionRecord | null> {
  const [rows] = await pool.query<DailyQuestionRow[]>(
    `SELECT id, date, category, question, options, visual_type, visual_data, correct_answer_index, explanation, source_type, source_context, created_at
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

export async function listRecentQuestionTexts(beforeDate: string, limit = 10): Promise<string[]> {
  const [rows] = await pool.query<Array<RowDataPacket & { question: string }>>(
    `SELECT question
     FROM daily_questions
     WHERE date < ?
     ORDER BY date DESC
     LIMIT ?`,
    [beforeDate, limit]
  );

  return rows.map((row) => row.question);
}

export async function createDailyQuestion(input: CreateDailyQuestionInput): Promise<DailyQuestionRecord> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO daily_questions
       (date, category, question, options, visual_type, visual_data, correct_answer_index, explanation, source_type, source_context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.date,
      input.category,
      input.question,
      JSON.stringify(input.options),
      input.visual?.type ?? null,
      input.visual ? JSON.stringify(input.visual.data) : null,
      input.correctAnswerIndex,
      input.explanation,
      input.sourceType,
      input.sourceContext
    ]
  );

  const created = await getDailyQuestionById(result.insertId);
  if (!created) {
    throw new Error("Failed to create daily question.");
  }
  return created;
}

export async function getDailyQuestionStats(questionId: number, optionCount: number): Promise<DailyQuestionStats> {
  const [countRows] = await pool.query<DailyAnswerRow[]>(
    `SELECT answer_index, COUNT(*) AS count
     FROM daily_answers
     WHERE question_id = ?
     GROUP BY answer_index`,
    [questionId]
  );

  const counts = Array.from({ length: optionCount }, () => 0);
  for (const row of countRows) {
    if (row.answer_index >= 0 && row.answer_index < optionCount) {
      counts[row.answer_index] = Number(row.count);
    }
  }

  const [voterRows] = await pool.query<DailyAnswerVoterRow[]>(
    `SELECT
       da.answer_index,
       da.answered_at,
       u.id AS user_id,
       u.nickname,
       u.avatar_url,
       u.created_at AS user_created_at
     FROM daily_answers da
     INNER JOIN users u ON u.id = da.user_id
     WHERE da.question_id = ?
     ORDER BY da.answered_at ASC`,
    [questionId]
  );

  const voters = Array.from({ length: optionCount }, () => [] as DailyQuestionVoter[]);
  for (const row of voterRows) {
    if (row.answer_index < 0 || row.answer_index >= optionCount) {
      continue;
    }
    voters[row.answer_index].push({
      id: row.user_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      createdAt: toIsoString(row.user_created_at),
      answeredAt: toIsoString(row.answered_at)
    });
  }

  return {
    questionId,
    counts,
    totalAnswers: counts.reduce((sum, count) => sum + count, 0),
    voters
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
