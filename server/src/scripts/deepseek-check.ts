import { env } from "../config/env.js";
import { generateQuestionExplanation } from "../services/question-bank-explanation.js";

interface ModelListResponse {
  data?: Array<{ id?: string }>;
}

function getDeepSeekUrl(pathname: string): URL {
  const baseUrl = env.DEEPSEEK_BASE_URL.endsWith("/")
    ? env.DEEPSEEK_BASE_URL
    : `${env.DEEPSEEK_BASE_URL}/`;
  return new URL(pathname, baseUrl);
}

async function checkAvailableModels(apiKey: string): Promise<string[]> {
  const response = await fetch(getDeepSeekUrl("models"), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `DeepSeek model check failed: ${response.status}${responseText ? ` ${responseText.slice(0, 600)}` : ""}`
    );
  }

  let payload: ModelListResponse;
  try {
    payload = JSON.parse(responseText) as ModelListResponse;
  } catch {
    throw new Error("DeepSeek model check returned invalid JSON.");
  }

  return (payload.data ?? [])
    .map((model) => model.id)
    .filter((modelId): modelId is string => typeof modelId === "string" && modelId.length > 0);
}

async function run(): Promise<void> {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  console.log(`[DeepSeekCheck] Base URL: ${env.DEEPSEEK_BASE_URL}`);
  console.log(`[DeepSeekCheck] Model: ${env.DEEPSEEK_MODEL}`);

  const models = await checkAvailableModels(apiKey);
  if (!models.includes(env.DEEPSEEK_MODEL)) {
    throw new Error(
      `Configured model ${env.DEEPSEEK_MODEL} is not available. Available models: ${models.join(", ") || "none"}.`
    );
  }
  console.log(`[DeepSeekCheck] Authentication succeeded. Available models: ${models.join(", ")}.`);

  const review = await generateQuestionExplanation({
    id: 0,
    source: "diagnostic",
    sourceQuestionId: "deepseek-check",
    category: "数学推理",
    passage: null,
    question: "一件商品原价 100 元，先涨价 20%，再降价 20%，现价是多少？",
    options: ["96 元", "100 元", "104 元", "80 元"],
    visual: null,
    correctAnswerIndex: 0,
    explanation: null,
    sourceContext: null
  });
  if (!review.valid) {
    throw new Error(`DeepSeek rejected the diagnostic question: ${review.reason}`);
  }

  console.log("[DeepSeekCheck] Explanation review passed schema validation.");
  console.log(JSON.stringify(review, null, 2));
}

void run().catch((error: unknown) => {
  console.error(
    `[DeepSeekCheck] Failed: ${error instanceof Error ? error.message : "Unknown DeepSeek check error."}`
  );
  process.exitCode = 1;
});
