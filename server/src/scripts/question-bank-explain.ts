import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  disableQuestionBankItem,
  listQuestionBankItemsAwaitingExplanation,
  saveQuestionBankExplanation
} from "../db/question-bank.js";
import { generateQuestionExplanation } from "../services/question-bank-explanation.js";
import {
  QUESTION_BANK_SOURCE_NAMES,
  type QuestionBankSourceName
} from "../services/question-bank-sources.js";

function readPositiveIntegerArgument(name: string, fallback: number): number {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!argument) {
    return fallback;
  }
  const parsed = Number(argument.slice(name.length + 3));
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new Error(`--${name} must be an integer between 1 and 10000.`);
  }
  return parsed;
}

function readSourceArgument(): QuestionBankSourceName | undefined {
  const argument = process.argv.find((value) => value.startsWith("--source="));
  if (!argument || argument === "--source=all") {
    return undefined;
  }
  const source = argument.slice("--source=".length);
  if (!QUESTION_BANK_SOURCE_NAMES.includes(source as QuestionBankSourceName)) {
    throw new Error(`Unknown question bank source: ${source}`);
  }
  return source as QuestionBankSourceName;
}

async function run(): Promise<void> {
  const limit = readPositiveIntegerArgument("limit", 20);
  const source = readSourceArgument();
  const items = await listQuestionBankItemsAwaitingExplanation(limit, source);
  if (items.length === 0) {
    console.log("[QuestionBank] No questions are awaiting explanation.");
    return;
  }

  let completed = 0;
  let disabled = 0;
  let failed = 0;
  for (const [index, item] of items.entries()) {
    try {
      const review = await generateQuestionExplanation(item);
      if (review.valid) {
        await saveQuestionBankExplanation(item.id, review.explanation, env.DEEPSEEK_MODEL);
        completed += 1;
      } else {
        await disableQuestionBankItem(item.id, `AI review rejected: ${review.reason}`);
        disabled += 1;
      }
      console.log(`[QuestionBank] Reviewed ${index + 1}/${items.length}: ${item.source}/${item.sourceQuestionId}`);
    } catch (error) {
      failed += 1;
      console.error(
        `[QuestionBank] Explanation failed for ${item.source}/${item.sourceQuestionId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[QuestionBank] Explanation run complete: ${completed} ready, ${disabled} disabled, ${failed} failed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error("Question bank explanation run failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
