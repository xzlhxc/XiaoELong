export interface QuestionGenerateInput {
  date: string;
  headlines: string[];
}

export interface QuestionGenerateOutput {
  question: string;
  options: string[];
  sourceContext: string;
}

export interface QuestionGeneratorProvider {
  generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput>;
}
