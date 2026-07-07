import { z } from "zod";
import { env } from "../../config/env.js";
import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";
import { MockQuestionGeneratorProvider } from "./mock-provider.js";

const generatedSchema = z.object({
  category: z.string().trim().min(1).max(32),
  question: z.string().trim().min(1).max(240),
  options: z.array(z.string().trim().min(1).max(80)).length(4),
  correctAnswerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(240)
});

export class DeepSeekQuestionGeneratorProvider implements QuestionGeneratorProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput> {
    const avoidSection =
      input.avoidQuestions && input.avoidQuestions.length > 0
        ? [
            "",
            "最近已经出过的题目，禁止重复或换皮重复：",
            ...input.avoidQuestions.map((question) => `- ${question}`)
          ]
        : [];
    const prompt = [
      "请为一个中文朋友群桌面小组件生成一道“每日一题”。必须输出严格 JSON。",
      "题目要求：",
      "- 中文四选一题，轻量、有趣、适合 30 秒内作答。",
      "- 题材从语文常识、数学、科学、历史地理、脑筋急转弯、轻量 puzzle 中混合随机选择。",
      "- 不能依赖图片、外部链接、当天新闻或专业冷门知识。",
      "- 只有一个正确答案，选项长度适中，不要在选项前写 A/B/C/D。",
      "- 解析要简短，直接解释为什么正确。",
      "",
      `日期: ${input.date}`,
      ...avoidSection,
      "",
      "JSON 输出格式示例：",
      "{\"category\":\"数学\",\"question\":\"一个数的20%是18，这个数是多少？\",\"options\":[\"72\",\"80\",\"90\",\"108\"],\"correctAnswerIndex\":2,\"explanation\":\"18除以0.2等于90。\"}"
    ].join("\n");

    const url = new URL("chat/completions", this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "你是一个严格输出 JSON 的中文出题助手。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.85,
        max_tokens: 800,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek generation failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek did not return content.");
    }

    const generated = generatedSchema.parse(JSON.parse(content) as unknown);
    return {
      ...generated,
      sourceContext: JSON.stringify({
        provider: "deepseek",
        model: this.model,
        date: input.date
      })
    };
  }
}

export function createQuestionGeneratorProvider(): QuestionGeneratorProvider {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key is not configured.");
  }
  return new DeepSeekQuestionGeneratorProvider(env.DEEPSEEK_API_KEY, env.DEEPSEEK_BASE_URL, env.DEEPSEEK_MODEL);
}

export function createFallbackQuestionGeneratorProvider(): QuestionGeneratorProvider {
  return new MockQuestionGeneratorProvider();
}
