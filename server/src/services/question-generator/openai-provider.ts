import { z } from "zod";
import { env } from "../../config/env.js";
import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";
import { MockQuestionGeneratorProvider } from "./mock-provider.js";

const generatedSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4)
});

export class OpenAIQuestionGeneratorProvider implements QuestionGeneratorProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput> {
    const prompt = [
      "你是一个中文社区的每日问题生成助手。",
      "请基于给定新闻标题，生成 1 道当日选择题。",
      "要求：",
      "- 题目与时事相关，但语气轻量，适合朋友群互动。",
      "- 返回 4 个互斥选项，长度适中，不要使用 A/B/C/D 前缀。",
      "- 只返回 JSON，不要额外解释。",
      "",
      `日期: ${input.date}`,
      "新闻标题：",
      ...input.headlines.map((line, index) => `${index + 1}. ${line}`),
      "",
      "返回格式：{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"]}"
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "你是一个严格返回 JSON 的助手。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: {
          type: "json_object"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI generation failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI did not return content.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned invalid JSON.");
    }

    const generated = generatedSchema.parse(parsed);
    return {
      question: generated.question,
      options: generated.options,
      sourceContext: JSON.stringify({
        provider: "openai",
        model: this.model,
        headlineCount: input.headlines.length
      })
    };
  }
}

export function createQuestionGeneratorProvider(): QuestionGeneratorProvider {
  if (env.OPENAI_API_KEY) {
    return new OpenAIQuestionGeneratorProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }
  return new MockQuestionGeneratorProvider();
}
