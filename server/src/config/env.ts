import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DB_HOST: z.string().min(1).default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default("xiaoelong"),
  DB_PASSWORD: z.string().default("xiaoelong"),
  DB_NAME: z.string().min(1).default("XiaoELong"),
  INVITE_CODE: z.string().trim().min(1),
  JWT_SECRET: z.string().trim().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default("30d"),
  MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(1000),
  MAX_AVATAR_SIZE_MB: z.coerce.number().positive().default(3),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  QUESTION_CRON: z.string().trim().min(1).default("0 0 * * *"),
  QUESTION_TIMEZONE: z.string().trim().min(1).default("Asia/Shanghai"),
  QUESTION_RSS_FEEDS: z
    .string()
    .trim()
    .min(1)
    .default("https://rss.nytimes.com/services/xml/rss/nyt/World.xml,https://feeds.bbci.co.uk/news/world/rss.xml"),
  QUESTION_HEADLINE_LIMIT: z.coerce.number().int().positive().max(20).default(8)
});

export const env = envSchema.parse(process.env);
