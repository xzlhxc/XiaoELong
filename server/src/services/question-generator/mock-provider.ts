import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";

function pickHeadline(headlines: string[]): string {
  if (headlines.length === 0) {
    return "今天的全球热点";
  }
  return headlines[Math.floor(Math.random() * headlines.length)];
}

export class MockQuestionGeneratorProvider implements QuestionGeneratorProvider {
  async generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput> {
    const headline = pickHeadline(input.headlines);
    return {
      question: `根据今天新闻“${headline}”，你更关注哪一类后续信息？`,
      options: ["官方后续声明", "对普通生活影响", "专家深度解读", "国际舆论反应"],
      sourceContext: JSON.stringify({
        provider: "mock",
        date: input.date,
        headline
      })
    };
  }
}
