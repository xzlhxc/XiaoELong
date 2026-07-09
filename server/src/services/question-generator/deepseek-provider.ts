import { z } from "zod";
import { env } from "../../config/env.js";
import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";
import { MockQuestionGeneratorProvider } from "./mock-provider.js";

const visualSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clock"),
    data: z.object({
      hour: z.number().int().min(1).max(12),
      minute: z.number().int().min(0).max(59)
    })
  }),
  z.object({
    type: z.literal("venn2"),
    data: z.object({
      leftLabel: z.string().trim().min(1).max(12),
      rightLabel: z.string().trim().min(1).max(12),
      leftOnly: z.number().int().min(0).max(99),
      both: z.number().int().min(0).max(99),
      rightOnly: z.number().int().min(0).max(99),
      outside: z.number().int().min(0).max(99).optional()
    })
  }),
  z.object({
    type: z.literal("pathGrid"),
    data: z.object({
      rows: z.number().int().min(2).max(5),
      cols: z.number().int().min(2).max(5),
      start: z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)]),
      end: z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)]),
      allowedMoves: z.array(z.enum(["right", "down"])).min(1).max(2)
    })
  }),
  z.object({
    type: z.literal("barChart"),
    data: z.object({
      title: z.string().trim().min(1).max(20).optional(),
      items: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(8),
            value: z.number().int().min(0).max(100)
          })
        )
        .min(3)
        .max(5)
    })
  }),
  z.object({
    type: z.literal("logicTable"),
    data: z.object({
      people: z.array(z.string().trim().min(1).max(8)).min(3).max(4),
      roles: z.array(z.string().trim().min(1).max(8)).min(3).max(4),
      marks: z
        .array(
          z.object({
            person: z.string().trim().min(1).max(8),
            role: z.string().trim().min(1).max(8),
            value: z.boolean()
          })
        )
        .min(1)
        .max(12)
    })
  }),
  z.object({
    type: z.literal("triangle"),
    data: z.object({
      points: z.tuple([
        z.string().trim().min(1).max(2),
        z.string().trim().min(1).max(2),
        z.string().trim().min(1).max(2)
      ]),
      equalSides: z.array(z.tuple([z.string().trim().min(1).max(2), z.string().trim().min(1).max(2)])).max(3).optional(),
      angles: z
        .array(
          z.object({
            point: z.string().trim().min(1).max(2),
            degrees: z.number().int().min(1).max(179)
          })
        )
        .max(3)
        .optional(),
      unknownAngleAt: z.string().trim().min(1).max(2).optional()
    })
  })
]);

const generatedSchema = z.object({
  category: z.string().trim().min(1).max(32),
  question: z.string().trim().min(1).max(240),
  options: z.array(z.string().trim().min(1).max(80)).length(4),
  visual: visualSchema.nullable().optional(),
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
      "- 中文四选一题，受众是大学生；难度中等偏上，不要幼稚、低龄、送分或纯玩笑。",
      "- 题型长期权重接近：逻辑推理 25%，语文常识 25%，数学/概率/数字推理 20%，科学/生活常识 15%，历史地理 10%，轻量 puzzle/脑筋急转弯 5%。",
      "- 语文常识优先包含：文学人物、唐宋八大家、成语词义、文言虚词、古代文体、修辞和诗词作者；不要考过度冷门的背诵细节。",
      "- 逻辑题应有明确推理链，可使用排除法、集合、路径、表格、钟表、简单几何或统计图。",
      "- 可以生成附图题，但只能使用 visual 模板字段；不能依赖真实图片、外部链接、当天新闻、复杂手绘或火柴摆放。",
      "- 只有一个正确答案，选项长度适中，不要在选项前写 A/B/C/D。",
      "- 解析要简短但有推理过程，直接解释为什么正确。",
      "- 如果不需要附图，visual 必须为 null。",
      "",
      "visual 模板只能从以下类型选择：",
      "- clock: {hour, minute}",
      "- venn2: {leftLabel, rightLabel, leftOnly, both, rightOnly, outside?}",
      "- pathGrid: {rows, cols, start:[row,col], end:[row,col], allowedMoves:[\"right\",\"down\"]}",
      "- barChart: {title?, items:[{label,value}]}",
      "- logicTable: {people, roles, marks:[{person,role,value}]}",
      "- triangle: {points:[\"A\",\"B\",\"C\"], equalSides?, angles?, unknownAngleAt?}",
      "",
      `日期: ${input.date}`,
      ...avoidSection,
      "",
      "JSON 输出格式示例：",
      "{\"category\":\"语文常识\",\"question\":\"下列哪位不是唐宋八大家？\",\"options\":[\"韩愈\",\"柳宗元\",\"李白\",\"苏轼\"],\"visual\":null,\"correctAnswerIndex\":2,\"explanation\":\"唐宋八大家包括韩愈、柳宗元、欧阳修、苏洵、苏轼、苏辙、王安石、曾巩，李白不在其中。\"}"
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
        temperature: 0.78,
        max_tokens: 1000,
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
      visual: generated.visual ?? null,
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
