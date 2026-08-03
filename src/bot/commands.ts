import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InputFile, type Bot } from "grammy";
import type { MyContext } from "./create-bot.js";
import { CATEGORIES, CATEGORY_EMOJI } from "../shared/constants.js";
import { formatTotals, formatExpenseList } from "./messages/report.messages.js";
import { parseDateRangeFromText, startOfMonth, todayInTimezone } from "../shared/dates.js";
import { pdfTitle } from "./handlers/message.handler.js";

export function registerCommands(bot: Bot<MyContext>): void {
  bot.command("start", (ctx) =>
    ctx.reply(
      "Kişisel gider takip botu hazır. Örnek: Migros 850 TL, Dün 240 TL benzin, Netflix 12 euro",
    ),
  );
  bot.command("help", (ctx) =>
    ctx.reply(`/today /week /month /last /categories /export /backup

Doğal dil örnekleri:
Bugün Migros'a 850 TL verdim
Bu ay ne kadar harcadım?
Son harcamayı sil
Son harcamayı 900 TL yap
Bu ayın ekstresini PDF gönder`),
  );
  bot.command("categories", (ctx) =>
    ctx.reply(CATEGORIES.map((c) => `${CATEGORY_EMOJI[c]} ${c}`).join("\n")),
  );
  bot.command("today", (ctx) =>
    ctx.reply(
      formatTotals(
        "📊 Bugünkü giderlerin",
        ctx.services.report.today(todayInTimezone(ctx.env.DEFAULT_TIMEZONE)),
      ),
    ),
  );
  bot.command("week", (ctx) =>
    ctx.reply(
      formatTotals(
        "📊 Bu haftaki giderlerin",
        ctx.services.report.week(todayInTimezone(ctx.env.DEFAULT_TIMEZONE)),
      ),
    ),
  );
  bot.command("month", (ctx) =>
    ctx.reply(
      formatTotals(
        "📊 Bu ayki giderlerin",
        ctx.services.report.month(todayInTimezone(ctx.env.DEFAULT_TIMEZONE)),
      ),
    ),
  );
  bot.command("last", (ctx) =>
    ctx.reply(formatExpenseList("Son 10 harcama", ctx.services.report.last(10))),
  );
  bot.command("export", async (ctx) => {
    const file = path.join(os.tmpdir(), `expenses-${Date.now()}.csv`);
    const rows = ctx.services.report.last(10_000).reverse();
    const body = [
      "Tarih,Tutar,Para birimi,Kategori,İşletme,Açıklama",
      ...rows.map((e) =>
        [
          e.expenseDate,
          (e.amountMinor / 100).toFixed(2),
          e.currency,
          e.category,
          e.merchant ?? "",
          e.description ?? "",
        ]
          .map(csv)
          .join(","),
      ),
    ].join("\n");
    fs.writeFileSync(file, `\uFEFF${body}`, "utf8");
    try {
      await ctx.replyWithDocument(new InputFile(file, "expenses.csv"));
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
  bot.command("backup", async (ctx) => {
    const file = path.join(os.tmpdir(), `expenses-backup-${Date.now()}.db`);
    ctx.services.sqlite.prepare("VACUUM INTO ?").run(file);
    try {
      await ctx.replyWithDocument(new InputFile(file, "expenses-backup.db"));
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
  bot.command("pdf", async (ctx) => {
    const today = todayInTimezone(ctx.env.DEFAULT_TIMEZONE);
    const text = ctx.message?.text ?? "bu ay";
    const range = parseDateRangeFromText(text, today) ?? {
      from: startOfMonth(today),
      to: today,
      label: "Bu ay",
    };
    const file = path.join(os.tmpdir(), `expenses-statement-${Date.now()}.pdf`);
    try {
      await ctx.services.pdfReport.createExpenseStatement({
        title: pdfTitle(range.label, range.from, range.to),
        periodLabel: `${range.from} - ${range.to}`,
        expenses: ctx.services.report.range(range.from, range.to),
        outputPath: file,
      });
      await ctx.replyWithDocument(
        new InputFile(file, `gider-ekstresi-${range.from}-${range.to}.pdf`),
      );
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
}

function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
