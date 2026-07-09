import type { DailyQuestionVisual } from "@xiaoelong/shared";

export interface QuestionGenerateInput {
  date: string;
  avoidQuestions?: string[];
}

export interface QuestionGenerateOutput {
  category: string;
  question: string;
  options: string[];
  visual: DailyQuestionVisual | null;
  correctAnswerIndex: number;
  explanation: string;
  sourceContext: string;
}

export interface QuestionGeneratorProvider {
  generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput>;
}
