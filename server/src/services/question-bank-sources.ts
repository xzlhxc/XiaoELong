import { createHash } from "node:crypto";
import type { QuestionBankImportItem } from "../db/question-bank.js";
import { createVisualQuestionBankItems } from "./visual-question-bank.js";

const SOURCE_FETCH_TIMEOUT_MS = 60_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const LOGIQA_REVISION = "955e1d3df6c59d9bfb44d9913da1e1a27ec14e18";
const CMMLU_REVISION = "d6e7b716d8ac694f38969a6c0407437d1fded799";

export const QUESTION_BANK_SOURCE_NAMES = ["logiqa2", "cmmlu", "raven_style"] as const;
export type QuestionBankSourceName = typeof QUESTION_BANK_SOURCE_NAMES[number];

interface SourceMetadata {
  title: string;
  homepage: string;
  license: string;
  licenseUrl: string;
  revision: string;
}

const SOURCE_METADATA: Record<QuestionBankSourceName, SourceMetadata> = {
  logiqa2: {
    title: "LogiQA 2.0",
    homepage: "https://github.com/csitfun/logiqa2.0",
    license: "CC BY-NC-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    revision: LOGIQA_REVISION
  },
  cmmlu: {
    title: "CMMLU Chinese Civil Service Exam",
    homepage: "https://huggingface.co/datasets/lmlmcat/cmmlu",
    license: "CC BY-NC 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    revision: CMMLU_REVISION
  },
  raven_style: {
    title: "RAVEN 风格程序化图推",
    homepage: "https://github.com/WellyZhang/RAVEN",
    license: "项目内程序化生成",
    licenseUrl: "https://github.com/WellyZhang/RAVEN",
    revision: "deterministic-rule-v1"
  }
};

function sourceContext(source: QuestionBankSourceName): string {
  return JSON.stringify({
    source,
    ...SOURCE_METADATA[source]
  });
}

async function fetchSourceText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain, application/json;q=0.9, */*;q=0.1" },
      redirect: "error",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Question bank download failed with status ${response.status}: ${url}`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
      throw new Error(`Question bank source is too large: ${url}`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_SOURCE_BYTES) {
      throw new Error(`Question bank source is too large: ${url}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function stripOptionLabel(value: string): string {
  return value.replace(/^\s*[A-DＡ-Ｄ][.．、:：]\s*/u, "").trim();
}

function createContentHash(input: {
  passage: string | null;
  question: string;
  options: string[];
  visual: QuestionBankImportItem["visual"];
  correctAnswerIndex: number;
}): string {
  const hashInput = input.visual
    ? input
    : {
        passage: input.passage,
        question: input.question,
        options: input.options,
        correctAnswerIndex: input.correctAnswerIndex
      };
  return createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
}

function createImportItem(input: Omit<QuestionBankImportItem, "contentHash">): QuestionBankImportItem | null {
  const passage = normalizeText(input.passage) || null;
  const question = normalizeText(input.question);
  const options = input.options.map((option) => stripOptionLabel(normalizeText(option)));
  if (
    !question
    || question.length > 2000
    || (passage?.length ?? 0) > 12_000
    || options.length !== 4
    || options.some((option) => !option || option.length > 1000)
    || new Set(options).size !== 4
    || !Number.isInteger(input.correctAnswerIndex)
    || input.correctAnswerIndex < 0
    || input.correctAnswerIndex > 3
  ) {
    return null;
  }

  return {
    ...input,
    passage,
    question,
    options,
    contentHash: createContentHash({
      passage,
      question,
      options,
      visual: input.visual,
      correctAnswerIndex: input.correctAnswerIndex
    })
  };
}

function parseJsonLines(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`Question bank JSONL is invalid at line ${index + 1}.`);
      }
    });
}

async function loadLogiQa2(): Promise<QuestionBankImportItem[]> {
  const splits = ["train", "dev", "test"] as const;
  const batches = await Promise.all(splits.map(async (split) => {
    const url = `https://raw.githubusercontent.com/csitfun/logiqa2.0/${LOGIQA_REVISION}/logiqa/DATA/LOGIQA/${split}_zh.txt`;
    const rows = parseJsonLines(await fetchSourceText(url));
    return rows.map((row, index) => {
      const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
      const options = Array.isArray(record.options) ? record.options.map(String) : [];
      return createImportItem({
        source: "logiqa2",
        sourceQuestionId: `${split}:${String(record.example_id ?? index)}`,
        category: "判断推理",
        passage: normalizeText(record.text) || null,
        question: normalizeText(record.question),
        options,
        visual: null,
        correctAnswerIndex: Number(record.answer),
        sourceContext: sourceContext("logiqa2")
      });
    }).filter((item): item is QuestionBankImportItem => item !== null);
  }));
  return batches.flat();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (quoted) {
    throw new Error("Question bank CSV contains an unterminated quoted field.");
  }
  return rows;
}

async function loadCmmlu(): Promise<QuestionBankImportItem[]> {
  const splits = ["dev", "test"] as const;
  const batches = await Promise.all(splits.map(async (split) => {
    const url = `https://raw.githubusercontent.com/haonan-li/CMMLU/${CMMLU_REVISION}/data/${split}/chinese_civil_service_exam.csv`;
    const rows = parseCsv(await fetchSourceText(url)).slice(1);
    return rows.map((row, index) => {
      const answer = normalizeText(row[6]).toUpperCase();
      return createImportItem({
        source: "cmmlu",
        sourceQuestionId: `${split}:${normalizeText(row[0]) || index}`,
        category: "公考常识",
        passage: null,
        question: normalizeText(row[1]),
        options: row.slice(2, 6),
        visual: null,
        correctAnswerIndex: answer.charCodeAt(0) - "A".charCodeAt(0),
        sourceContext: sourceContext("cmmlu")
      });
    }).filter((item): item is QuestionBankImportItem => item !== null);
  }));
  return batches.flat();
}

export async function loadQuestionBankSource(source: QuestionBankSourceName): Promise<QuestionBankImportItem[]> {
  if (source === "logiqa2") {
    return loadLogiQa2();
  }
  if (source === "cmmlu") {
    return loadCmmlu();
  }
  return createVisualQuestionBankItems();
}
