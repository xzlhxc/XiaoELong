import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { DailyQuestionVisual } from "@xiaoelong/shared";
import { pool } from "./pool.js";

export interface QuestionBankImportItem {
  source: string;
  sourceQuestionId: string;
  category: string;
  passage: string | null;
  question: string;
  options: string[];
  visual: DailyQuestionVisual | null;
  correctAnswerIndex: number;
  contentHash: string;
  sourceContext: string;
  explanation?: string | null;
  explanationModel?: string | null;
}

export interface QuestionBankItem {
  id: number;
  source: string;
  sourceQuestionId: string;
  category: string;
  passage: string | null;
  question: string;
  options: string[];
  visual: DailyQuestionVisual | null;
  correctAnswerIndex: number;
  explanation: string | null;
  sourceContext: string | null;
}

interface QuestionBankRow extends RowDataPacket {
  id: number | string;
  source: string;
  source_question_id: string;
  category: string;
  passage: string | null;
  question: string;
  options: string | string[];
  visual_type: DailyQuestionVisual["type"] | null;
  visual_data: string | DailyQuestionVisual["data"] | null;
  correct_answer_index: number;
  explanation: string | null;
  source_context: string | null;
}

function parseVisual(
  type: DailyQuestionVisual["type"] | null,
  value: string | DailyQuestionVisual["data"] | null
): DailyQuestionVisual | null {
  if (!type || value === null) {
    return null;
  }
  try {
    const data = typeof value === "string" ? JSON.parse(value) as DailyQuestionVisual["data"] : value;
    return { type, data } as DailyQuestionVisual;
  } catch {
    return null;
  }
}

function parseOptions(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((option): option is string => typeof option === "string")
      : [];
  } catch {
    return [];
  }
}

function mapQuestionBankRow(row: QuestionBankRow): QuestionBankItem {
  return {
    id: Number(row.id),
    source: row.source,
    sourceQuestionId: row.source_question_id,
    category: row.category,
    passage: row.passage,
    question: row.question,
    options: parseOptions(row.options),
    visual: parseVisual(row.visual_type, row.visual_data),
    correctAnswerIndex: Number(row.correct_answer_index),
    explanation: row.explanation,
    sourceContext: row.source_context
  };
}

export async function upsertQuestionBankItems(items: QuestionBankImportItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO question_bank (
           source,
           source_question_id,
           category,
           passage,
           question,
           options,
           visual_type,
           visual_data,
           correct_answer_index,
           content_hash,
           source_context,
           explanation,
           explanation_model,
           explanation_generated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, CURRENT_TIMESTAMP))
         ON DUPLICATE KEY UPDATE
           category = VALUES(category),
           passage = VALUES(passage),
           question = VALUES(question),
           options = VALUES(options),
           visual_type = VALUES(visual_type),
           visual_data = VALUES(visual_data),
           correct_answer_index = VALUES(correct_answer_index),
           source_context = VALUES(source_context),
           explanation = IF(content_hash = VALUES(content_hash), COALESCE(explanation, VALUES(explanation)), VALUES(explanation)),
           explanation_model = IF(content_hash = VALUES(content_hash), COALESCE(explanation_model, VALUES(explanation_model)), VALUES(explanation_model)),
           explanation_generated_at = IF(content_hash = VALUES(content_hash), COALESCE(explanation_generated_at, VALUES(explanation_generated_at)), VALUES(explanation_generated_at)),
           validation_notes = IF(content_hash = VALUES(content_hash), validation_notes, NULL),
           enabled = IF(content_hash = VALUES(content_hash), enabled, TRUE),
           content_hash = VALUES(content_hash)`,
        [
          item.source,
          item.sourceQuestionId,
          item.category,
          item.passage,
          item.question,
          JSON.stringify(item.options),
          item.visual?.type ?? null,
          item.visual ? JSON.stringify(item.visual.data) : null,
          item.correctAnswerIndex,
          item.contentHash,
          item.sourceContext,
          item.explanation ?? null,
          item.explanationModel ?? null,
          item.explanation ?? null
        ]
      );
    }
    await connection.commit();
    return items.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listQuestionBankItemsAwaitingExplanation(
  limit: number,
  source?: string
): Promise<QuestionBankItem[]> {
  const sourceClause = source ? "AND source = ?" : "";
  const parameters: Array<string | number> = source ? [source, limit] : [limit];
  const [rows] = await pool.query<QuestionBankRow[]>(
    `SELECT id, source, source_question_id, category, passage, question, options, visual_type, visual_data,
            correct_answer_index, explanation, source_context
     FROM question_bank
     WHERE enabled = TRUE
       AND explanation IS NULL
       ${sourceClause}
     ORDER BY id ASC
     LIMIT ?`,
    parameters
  );
  return rows.map(mapQuestionBankRow);
}

export async function saveQuestionBankExplanation(
  id: number,
  explanation: string,
  model: string
): Promise<void> {
  await pool.execute(
    `UPDATE question_bank
     SET explanation = ?,
         explanation_model = ?,
         explanation_generated_at = CURRENT_TIMESTAMP,
         validation_notes = NULL,
         enabled = TRUE
     WHERE id = ?`,
    [explanation, model, id]
  );
}

export async function disableQuestionBankItem(id: number, reason: string): Promise<void> {
  await pool.execute(
    `UPDATE question_bank
     SET enabled = FALSE,
         validation_notes = ?,
         explanation = NULL,
         explanation_model = NULL,
         explanation_generated_at = NULL
     WHERE id = ?`,
    [reason.slice(0, 2000), id]
  );
}

export async function getNextReadyQuestionBankItem(date: string): Promise<QuestionBankItem | null> {
  const [rows] = await pool.query<QuestionBankRow[]>(
    `SELECT qb.id, qb.source, qb.source_question_id, qb.category, qb.passage,
            qb.question, qb.options, qb.visual_type, qb.visual_data, qb.correct_answer_index, qb.explanation,
            qb.source_context
     FROM question_bank qb
     WHERE qb.enabled = TRUE
       AND qb.explanation IS NOT NULL
       AND CHAR_LENGTH(TRIM(qb.explanation)) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM daily_questions used
         LEFT JOIN question_bank used_item ON used_item.id = used.bank_question_id
         WHERE used_item.content_hash = qb.content_hash
            OR (
              used.question = qb.question
              AND COALESCE(used.passage, '') = COALESCE(qb.passage, '')
              AND CAST(used.options AS CHAR) = CAST(qb.options AS CHAR)
            )
       )
     ORDER BY (SELECT COUNT(*)
               FROM daily_questions source_use
               INNER JOIN question_bank source_item ON source_item.id = source_use.bank_question_id
               WHERE source_item.source = qb.source) ASC,
              CRC32(CONCAT(qb.id, ?)) ASC
     LIMIT 1`,
    [date]
  );
  return rows.length > 0 ? mapQuestionBankRow(rows[0]) : null;
}

export async function getNextReadyQuestionBankPreviewItem(
  preferredSource: string | undefined,
  excludedIds: number[]
): Promise<QuestionBankItem | null> {
  const safeExcludedIds = excludedIds.slice(0, 2000);
  const excludedClause = safeExcludedIds.length > 0
    ? `AND content_hash NOT IN (
         SELECT seen.content_hash
         FROM question_bank seen
         WHERE seen.id IN (${safeExcludedIds.map(() => "?").join(", ")})
       )`
    : "";
  const sourceClause = preferredSource ? "AND source = ?" : "";
  const parameters: Array<string | number> = [
    ...(preferredSource ? [preferredSource] : []),
    ...safeExcludedIds
  ];
  const [rows] = await pool.query<QuestionBankRow[]>(
    `SELECT id, source, source_question_id, category, passage, question, options,
            visual_type, visual_data, correct_answer_index, explanation, source_context
     FROM question_bank
     WHERE enabled = TRUE
       AND explanation IS NOT NULL
       AND CHAR_LENGTH(TRIM(explanation)) > 0
       ${sourceClause}
       ${excludedClause}
     ORDER BY CRC32(CONCAT(id, source, ?)) ASC
     LIMIT 1`,
    [...parameters, safeExcludedIds.length]
  );
  if (rows.length > 0 || !preferredSource) {
    return rows.length > 0 ? mapQuestionBankRow(rows[0]) : null;
  }
  return getNextReadyQuestionBankPreviewItem(undefined, safeExcludedIds);
}
