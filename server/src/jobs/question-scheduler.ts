import cron from "node-cron";
import { env } from "../config/env.js";
import { DailyQuestionService } from "../services/daily-question-service.js";

export function startQuestionScheduler(service: DailyQuestionService): void {
  cron.schedule(
    env.QUESTION_CRON,
    async () => {
      try {
        const question = await service.ensureTodayQuestion();
        console.log(`[DailyQuestion] Scheduled generation ready for ${question.date} (${question.sourceType}).`);
      } catch (error) {
        console.error("[DailyQuestion] Scheduled generation failed:", error);
      }
    },
    {
      timezone: env.QUESTION_TIMEZONE
    }
  );
}
