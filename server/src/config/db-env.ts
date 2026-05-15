import { config } from "dotenv";
import { z } from "zod";

config();

const dbEnvSchema = z.object({
  DB_HOST: z.string().min(1).default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default("xiaoelong"),
  DB_PASSWORD: z.string().default("xiaoelong"),
  DB_NAME: z.string().min(1).default("XiaoELong")
});

export const dbEnv = dbEnvSchema.parse(process.env);
