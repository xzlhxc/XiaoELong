import { z } from "zod";
import { env } from "../config/env.js";
import type { QuestionBankItem } from "../db/question-bank.js";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 60_000;

const reviewSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    explanation: z.string().trim().min(8).max(1200),
    reason: z.string().optional()
  }),
  z.object({
    valid: z.literal(false),
    explanation: z.string().optional(),
    reason: z.string().trim().min(1).max(1000)
  })
]);

export type QuestionExplanationReview = z.infer<typeof reviewSchema>;

function getDeepSeekUrl(): URL {
  return new URL("chat/completions", env.DEEPSEEK_BASE_URL.endsWith("/")
    ? env.DEEPSEEK_BASE_URL
    : `${env.DEEPSEEK_BASE_URL}/`);
}

function parseJsonObject(content: string): unknown {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(normalized) as unknown;
}

function buildPrompt(item: QuestionBankItem): string {
  const labels = ["A", "B", "C", "D"];
  return [
    "请审核下面这道中文四选一题，并为已经给定的标准答案编写简洁解析。",
    "审核规则：",
    "1. 你必须独立解题，不能因为提供了标准答案就默认它正确。",
    "2. 只有恰好一个正确选项，且与标准答案一致时，valid 才能为 true。",
    "3. 若题干不完整、选项重复、答案不唯一、标准答案错误、知识已经过时或无法可靠判断，valid 必须为 false，并说明 reason。",
    "4. valid 为 true 时，explanation 应说明关键推理，并简要指出其余选项为何不成立；不要提及“题库答案”或审核过程。",
    "5. 只输出 JSON：有效时 {\"valid\":true,\"explanation\":\"...\"}；无效时 {\"valid\":false,\"reason\":\"...\"}。",
    "",
    item.passage ? `材料：${item.passage}` : "材料：无",
    `题目：${item.question}`,
    ...item.options.map((option, index) => `${labels[index]}. ${option}`),
    `标准答案：${labels[item.correctAnswerIndex]}`
  ].join("\n");
}

export async function generateQuestionExplanation(item: QuestionBankItem): Promise<QuestionExplanationReview> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(getDeepSeekUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content: "你是严谨的公考题目审核员。必须独立验算，只输出一个 JSON 对象。"
            },
            { role: "user", content: buildPrompt(item) }
          ],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 1000,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`DeepSeek explanation request failed with status ${response.status}.`);
      }
      const payload = await response.json() as {
        choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }>;
      };
      const choice = payload.choices?.[0];
      if (choice?.finish_reason && choice.finish_reason !== "stop") {
        throw new Error(`DeepSeek explanation stopped unexpectedly: ${choice.finish_reason}.`);
      }
      const content = choice?.message?.content;
      if (!content) {
        throw new Error("DeepSeek explanation response was empty.");
      }
      return reviewSchema.parse(parseJsonObject(content));
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("DeepSeek explanation generation failed.");
}
