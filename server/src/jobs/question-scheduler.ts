import cron from "node-cron";
import { env } from "../config/env.js";
import { DailyQuestionService } from "../services/daily-question-service.js";

export function startQuestionScheduler(service: DailyQuestionService): void {
  cron.schedule(
    env.QUESTION_CRON,
    async () => {
      try {
        const question = await service.ensureTodayQuestion();
        console.log(`[DailyQuestion] Scheduled question ready for ${question.date} (${question.sourceType}).`);
      } catch (error) {
        console.error("[DailyQuestion] Scheduled question selection failed:", error);
      }
    },
    {
      timezone: env.QUESTION_TIMEZONE
    }
  );
}
