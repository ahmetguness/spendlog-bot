import { Bot, type Context } from "grammy";
import type BetterSqlite3 from "better-sqlite3";
import type { Env } from "../config/env.js";
import type { AliasRepository } from "../database/repositories/alias.repository.js";
import type { ExpenseRepository } from "../database/repositories/expense.repository.js";
import type { ProcessedUpdateRepository } from "../database/repositories/processed-update.repository.js";
import type { ExpenseService } from "../expenses/expense.service.js";
import type { OpenAiBankImageParser } from "../parsing/image-parser.js";
import type { ParserService } from "../parsing/parser.service.js";
import type { PdfReportService } from "../reports/pdf-report.service.js";
import type { ReportService } from "../reports/report.service.js";
import { logger } from "../shared/logger.js";
import { registerCommands } from "./commands.js";
import { registerCallbackHandlers } from "./handlers/callback.handler.js";
import { registerImageHandler } from "./handlers/image.handler.js";
import { registerMessageHandler } from "./handlers/message.handler.js";

export interface Services {
  sqlite: BetterSqlite3.Database;
  aliases: AliasRepository;
  expenses: ExpenseRepository;
  processed: ProcessedUpdateRepository;
  expense: ExpenseService;
  parser: ParserService;
  imageParser: OpenAiBankImageParser;
  report: ReportService;
  pdfReport: PdfReportService;
}

export type MyContext = Context & { env: Env; services: Services };

export function createBot(env: Env, services: Services): Bot<MyContext> {
  const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);
  bot.use(async (ctx, next) => {
    ctx.env = env;
    ctx.services = services;
    if (ctx.from?.id !== env.ALLOWED_TELEGRAM_USER_ID) {
      logger.warn(
        {
          eventType: "unauthorized_access",
          telegramUserId: ctx.from?.id,
          updateId: ctx.update.update_id,
        },
        "Unauthorized Telegram access",
      );
      await ctx.reply("Bu bot özel kullanım içindir.");
      return;
    }
    if (services.processed.has(ctx.update.update_id)) return;
    await next();
    services.processed.mark(ctx.update.update_id);
  });
  registerCommands(bot);
  registerCallbackHandlers(bot);
  registerImageHandler(bot);
  registerMessageHandler(bot);
  bot.catch((err) => {
    logger.error(
      {
        eventType: "bot_error",
        errorCode: err.error instanceof Error ? err.error.name : "unknown",
      },
      "Bot error",
    );
  });
  return bot;
}
