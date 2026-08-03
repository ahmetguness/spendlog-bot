import { loadEnv } from "./config/env.js";
import { createDatabaseClient } from "./database/client.js";
import { migrate } from "./database/migrate.js";
import { AliasRepository } from "./database/repositories/alias.repository.js";
import { ExpenseRepository } from "./database/repositories/expense.repository.js";
import { PendingExpenseRepository } from "./database/repositories/pending-expense.repository.js";
import { PendingUpdateRepository } from "./database/repositories/pending-update.repository.js";
import { ProcessedUpdateRepository } from "./database/repositories/processed-update.repository.js";
import { UndoRepository } from "./database/repositories/undo.repository.js";
import { ExpenseService } from "./expenses/expense.service.js";
import { OpenAiAudioTranscriber } from "./parsing/audio-transcriber.js";
import { OpenAiBankImageParser } from "./parsing/image-parser.js";
import { OpenAiParser } from "./parsing/openai-parser.js";
import { ParserService } from "./parsing/parser.service.js";
import { PdfReportService } from "./reports/pdf-report.service.js";
import { ReportService } from "./reports/report.service.js";
import { logger } from "./shared/logger.js";
import { createBot } from "./bot/create-bot.js";

const env = loadEnv();
migrate(env.DATABASE_PATH);
const client = createDatabaseClient(env.DATABASE_PATH);
const expenses = new ExpenseRepository(client.sqlite);
const pending = new PendingExpenseRepository(client.sqlite);
const pendingUpdates = new PendingUpdateRepository(client.sqlite);
const undo = new UndoRepository(client.sqlite);
const services = {
  sqlite: client.sqlite,
  aliases: new AliasRepository(client.sqlite),
  expenses,
  processed: new ProcessedUpdateRepository(client.sqlite),
  expense: new ExpenseService(
    expenses,
    pending,
    pendingUpdates,
    undo,
    env.PENDING_EXPENSE_TTL_MINUTES,
  ),
  parser: new ParserService(new OpenAiParser(env.OPENAI_API_KEY, env.OPENAI_MODEL)),
  transcriber: new OpenAiAudioTranscriber(env.OPENAI_API_KEY, env.OPENAI_TRANSCRIPTION_MODEL),
  imageParser: new OpenAiBankImageParser(
    env.OPENAI_API_KEY,
    env.OPENAI_IMAGE_MODEL ?? env.OPENAI_MODEL,
    env.MAX_IMAGE_EXPENSES,
    env.MIN_IMAGE_CONFIDENCE,
  ),
  report: new ReportService(expenses),
  pdfReport: new PdfReportService(),
};
const bot = createBot(env, services);
const cleanup = setInterval(() => services.expense.cleanupExpired(), 5 * 60_000);
cleanup.unref();

process.on("unhandledRejection", (error) =>
  logger.error(
    {
      eventType: "unhandled_rejection",
      errorCode: error instanceof Error ? error.name : "unknown",
    },
    "Unhandled rejection",
  ),
);
process.on("uncaughtException", (error) =>
  logger.fatal({ eventType: "uncaught_exception", errorCode: error.name }, "Uncaught exception"),
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ eventType: "shutdown", signal }, "Shutting down");
  clearInterval(cleanup);
  await bot.stop();
  client.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.info({ eventType: "bot_start" }, "Starting bot");
void bot.start({ drop_pending_updates: false });
