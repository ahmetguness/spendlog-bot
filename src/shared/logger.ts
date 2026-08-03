import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "*.token", "*.apiKey"],
});
