import type { DailyQuestion, DailyQuestionStats } from "@xiaoelong/shared";
import { env } from "../config/env.js";
import {
  createDailyQuestion,
  getDailyAnswerIndexByUser,
  getDailyQuestionByDate,
  getDailyQuestionById,
  getDailyQuestionStats,
  getLatestOnlineDailyQuestion,
  submitDailyAnswer
} from "../db/daily-questions.js";
import { getDateInTimezone } from "../utils/time.js";
import { fetchNewsHeadlines } from "./rss-news.js";
import { createQuestionGeneratorProvider } from "./question-generator/openai-provider.js";

export class DailyQuestionValidationError extends Error {}

export class DailyQuestionService {
  async ensureQuestionForDate(date: string): Promise<DailyQuestion> {
    const existing = await getDailyQuestionByDate(date);
    if (existing) {
      return existing;
    }

    try {
      const headlines = await fetchNewsHeadlines();
      const provider = createQuestionGeneratorProvider();
      const generated = await provider.generate({ date, headlines });
      return await createDailyQuestion({
        date,
        question: generated.question,
        options: generated.options,
        sourceType: "online",
        sourceContext: generated.sourceContext
      });
    } catch (error) {
      const latestOnline = await getLatestOnlineDailyQuestion(date);
      if (latestOnline) {
        return await createDailyQuestion({
          date,
          question: latestOnline.question,
          options: latestOnline.options,
          sourceType: "fallback",
          sourceContext: JSON.stringify({
            fallbackFromDate: latestOnline.date,
            reason: error instanceof Error ? error.message : "unknown"
          })
        });
      }

      return await createDailyQuestion({
        date,
        question: "如果只能给今天定一个关键词，你会选哪一个？",
        options: ["行动", "耐心", "沟通", "探索"],
        sourceType: "fallback",
        sourceContext: JSON.stringify({
          fallbackFromDate: null,
          reason: "no_online_question_available"
        })
      });
    }
  }

  async ensureTodayQuestion(): Promise<DailyQuestion> {
    const date = getDateInTimezone(new Date(), env.QUESTION_TIMEZONE);
    return this.ensureQuestionForDate(date);
  }

  async getQuestionWithStatsForUser(userId: string): Promise<{
    question: DailyQuestion;
    stats: DailyQuestionStats;
    answeredIndex: number | null;
  }> {
    const question = await this.ensureTodayQuestion();
    const stats = await getDailyQuestionStats(question.id, question.options.length);
    const answeredIndex = await getDailyAnswerIndexByUser(question.id, userId);

    return {
      question,
      stats,
      answeredIndex
    };
  }

  async submitAnswer(questionId: number, userId: string, answerIndex: number): Promise<{
    question: DailyQuestion;
    stats: DailyQuestionStats;
    answeredIndex: number;
  }> {
    const question = await getDailyQuestionById(questionId);
    if (!question) {
      throw new DailyQuestionValidationError("Question not found.");
    }
    if (answerIndex < 0 || answerIndex >= question.options.length) {
      throw new DailyQuestionValidationError("Answer index out of range.");
    }

    try {
      await submitDailyAnswer(questionId, userId, answerIndex);
    } catch (error) {
      if ((error as { code?: string })?.code === "ER_DUP_ENTRY") {
        throw new DailyQuestionValidationError("You have already answered this question.");
      }
      throw error;
    }

    const stats = await getDailyQuestionStats(questionId, question.options.length);
    return {
      question,
      stats,
      answeredIndex: answerIndex
    };
  }

  async getStats(questionId: number): Promise<DailyQuestionStats> {
    const question = await getDailyQuestionById(questionId);
    if (!question) {
      throw new DailyQuestionValidationError("Question not found.");
    }
    return getDailyQuestionStats(questionId, question.options.length);
  }
}
