import { pool } from "../db/pool.js";
import { upsertQuestionBankItems } from "../db/question-bank.js";
import {
  loadQuestionBankSource,
  QUESTION_BANK_SOURCE_NAMES,
  type QuestionBankSourceName
} from "../services/question-bank-sources.js";

const UPSERT_BATCH_SIZE = 250;

function readRequestedSources(): QuestionBankSourceName[] {
  const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
  if (!sourceArgument || sourceArgument === "--source=all") {
    return [...QUESTION_BANK_SOURCE_NAMES];
  }
  const source = sourceArgument.slice("--source=".length);
  if (!QUESTION_BANK_SOURCE_NAMES.includes(source as QuestionBankSourceName)) {
    throw new Error(`Unknown question bank source: ${source}`);
  }
  return [source as QuestionBankSourceName];
}

async function run(): Promise<void> {
  const sources = readRequestedSources();
  let imported = 0;
  for (const source of sources) {
    console.log(`[QuestionBank] Downloading pinned ${source} source...`);
    const items = await loadQuestionBankSource(source);
    for (let offset = 0; offset < items.length; offset += UPSERT_BATCH_SIZE) {
      imported += await upsertQuestionBankItems(items.slice(offset, offset + UPSERT_BATCH_SIZE));
    }
    console.log(`[QuestionBank] ${source}: ${items.length} valid questions imported or updated.`);
  }
  console.log(`[QuestionBank] Import complete. Processed ${imported} questions.`);
}

run()
  .catch((error) => {
    console.error("Question bank import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
