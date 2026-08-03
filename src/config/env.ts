import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  LOG_LEVEL: z.string().default("info"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_TELEGRAM_USER_ID: z.coerce.number().int().positive(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  DATABASE_PATH: z.string().min(1).default("/app/data/expenses.db"),
  DEFAULT_TIMEZONE: z.string().default("Europe/Istanbul"),
  PENDING_EXPENSE_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  MAX_MESSAGE_LENGTH: z.coerce.number().int().min(100).max(4000).default(2000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return parsed.data;
}
