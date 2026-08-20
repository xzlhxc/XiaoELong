import type { DailyQuestion, DailyQuestionDevPreviewResponse, DailyQuestionResult, DailyQuestionStats } from "@xiaoelong/shared";
import { env } from "../config/env.js";
import {
  createDailyQuestion,
  type DailyQuestionRecord,
  getDailyAnswerIndexByUser,
  getDailyQuestionByDate,
  getDailyQuestionById,
  getDailyQuestionStats,
  submitDailyAnswer,
  toPublicDailyQuestion
} from "../db/daily-questions.js";
import {
  getNextReadyQuestionBankItem,
  getNextReadyQuestionBankPreviewItem
} from "../db/question-bank.js";
import { getResetDayInTimezone } from "../utils/time.js";

const QUESTION_RESET_HOUR = 8;

export class DailyQuestionValidationError extends Error {}
export class DailyQuestionUnavailableError extends Error {}

function buildQuestionResult(question: DailyQuestionRecord, answeredIndex: number): DailyQuestionResult | null {
  if (!question.hasAnswerKey) {
    return null;
  }

  return {
    answeredIndex,
    correctAnswerIndex: question.correctAnswerIndex,
    isCorrect: answeredIndex === question.correctAnswerIndex,
    explanation: question.explanation
  };
}

export class DailyQuestionService {
  private readonly pendingQuestionEnsures = new Map<string, Promise<DailyQuestionRecord>>();

  async ensureQuestionForDate(date: string): Promise<DailyQuestionRecord> {
    const pending = this.pendingQuestionEnsures.get(date);
    if (pending) {
      return pending;
    }

    const task = this.ensureQuestionForDateOnce(date);
    this.pendingQuestionEnsures.set(date, task);
    try {
      return await task;
    } finally {
      if (this.pendingQuestionEnsures.get(date) === task) {
        this.pendingQuestionEnsures.delete(date);
      }
    }
  }

  private async ensureQuestionForDateOnce(date: string): Promise<DailyQuestionRecord> {
    const existing = await getDailyQuestionByDate(date);
    if (existing) {
      return existing;
    }

    const bankItem = await getNextReadyQuestionBankItem(date);
    if (!bankItem?.explanation) {
      throw new DailyQuestionUnavailableError("题库中的未出题目已经用完，请补充并审核新题后再试。");
    }

    try {
      return await createDailyQuestion({
        bankQuestionId: bankItem.id,
        date,
        category: bankItem.category,
        passage: bankItem.passage,
        question: bankItem.question,
        options: bankItem.options,
        visual: bankItem.visual,
        correctAnswerIndex: bankItem.correctAnswerIndex,
        explanation: bankItem.explanation,
        sourceType: "question_bank",
        sourceContext: bankItem.sourceContext
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "ER_DUP_ENTRY") {
        const canonical = await getDailyQuestionByDate(date);
        if (canonical) {
          return canonical;
        }
      }
      throw error;
    }
  }

  async ensureTodayQuestion(): Promise<DailyQuestionRecord> {
    const date = getResetDayInTimezone(new Date(), env.QUESTION_TIMEZONE, QUESTION_RESET_HOUR);
    return this.ensureQuestionForDate(date);
  }

  async getQuestionWithStatsForUser(userId: string): Promise<{
    question: DailyQuestion;
    stats: DailyQuestionStats;
    answeredIndex: number | null;
    result: DailyQuestionResult | null;
  }> {
    const question = await this.ensureTodayQuestion();
    const stats = await getDailyQuestionStats(question.id, question.options.length);
    const answeredIndex = await getDailyAnswerIndexByUser(question.id, userId);

    return {
      question: toPublicDailyQuestion(question),
      stats,
      answeredIndex,
      result: answeredIndex === null ? null : buildQuestionResult(question, answeredIndex)
    };
  }

  async submitAnswer(questionId: number, userId: string, answerIndex: number): Promise<{
    question: DailyQuestion;
    stats: DailyQuestionStats;
    answeredIndex: number;
    result: DailyQuestionResult | null;
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
      question: toPublicDailyQuestion(question),
      stats,
      answeredIndex: answerIndex,
      result: buildQuestionResult(question, answerIndex)
    };
  }

  async getStats(questionId: number): Promise<DailyQuestionStats> {
    const question = await getDailyQuestionById(questionId);
    if (!question) {
      throw new DailyQuestionValidationError("Question not found.");
    }
    return getDailyQuestionStats(questionId, question.options.length);
  }

  async getNextDevelopmentPreview(
    preferredSource: string | undefined,
    excludedBankQuestionIds: number[]
  ): Promise<DailyQuestionDevPreviewResponse> {
    let item = await getNextReadyQuestionBankPreviewItem(preferredSource, excludedBankQuestionIds);
    let resetSeen = false;
    if (!item && excludedBankQuestionIds.length > 0) {
      item = await getNextReadyQuestionBankPreviewItem(preferredSource, []);
      resetSeen = true;
    }
    if (!item?.explanation) {
      throw new DailyQuestionValidationError("No reviewed question-bank item is available.");
    }

    return {
      bankQuestionId: item.id,
      source: item.source,
      resetSeen,
      question: {
        id: -item.id,
        date: getResetDayInTimezone(new Date(), env.QUESTION_TIMEZONE, QUESTION_RESET_HOUR),
        category: item.category,
        passage: item.passage,
        question: item.question,
        options: item.options,
        visual: item.visual,
        sourceType: "question_bank",
        sourceContext: item.sourceContext,
        createdAt: new Date().toISOString()
      },
      correctAnswerIndex: item.correctAnswerIndex,
      explanation: item.explanation
    };
  }
}
