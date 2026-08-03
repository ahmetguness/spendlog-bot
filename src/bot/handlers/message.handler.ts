import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InputFile, type Bot } from "grammy";
import type { MyContext } from "../create-bot.js";
import {
  deleteConfirmationKeyboard,
  deletePickKeyboard,
  batchConfirmationKeyboard,
  expenseConfirmationKeyboard,
  updateAmountConfirmationKeyboard,
} from "../keyboards/expense-confirmation.keyboard.js";
import { expensePreview, unknownMessage, expenseLine } from "../messages/expense.messages.js";
import { formatExpenseList, formatTotals } from "../messages/report.messages.js";
import type { ExpenseFilter } from "../../database/repositories/expense.repository.js";
import type { Expense } from "../../expenses/expense.types.js";
import { matchCategory } from "../../parsing/category-matcher.js";
import { parseAmount } from "../../parsing/amount-parser.js";
import { CATEGORIES } from "../../shared/constants.js";
import {
  endOfMonth,
  parseDateRangeFromText,
  startOfMonth,
  todayInTimezone,
} from "../../shared/dates.js";
import { formatMinorUnit } from "../../shared/money.js";

export function registerMessageHandler(bot: Bot<MyContext>): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.length > ctx.env.MAX_MESSAGE_LENGTH) {
      await ctx.reply("Mesaj çok uzun.");
      return;
    }
    const today = todayInTimezone(ctx.env.DEFAULT_TIMEZONE);
    const lower = text.toLocaleLowerCase("tr-TR");
    if (await handleAliasTeaching(ctx, text, lower)) return;
    if (await handlePendingCorrection(ctx, text, lower, today)) return;
    const expenseLines = extractExpenseLines(text);
    if (expenseLines.length > 1) {
      const pendingIds: number[] = [];
      await ctx.reply(`${expenseLines.length} gider bulundu. Her biri için ayrı onay oluşturdum.`);
      for (const [index, line] of expenseLines.entries()) {
        const draft = applyAliases(
          ctx,
          await ctx.services.parser.parseExpense(
            line,
            ctx.message.message_id * 1000 + index + 1,
            today,
            ctx.env.DEFAULT_TIMEZONE,
          ),
        );
        if (!draft) {
          await ctx.reply(`${index + 1}. satırı anlayamadım:\n${line}`);
          continue;
        }
        const pending = ctx.services.expense.createPending(draft);
        pendingIds.push(pending.id);
        await ctx.reply(expensePreview(pending), {
          reply_markup: expenseConfirmationKeyboard(pending.id),
        });
      }
      if (pendingIds.length > 1) {
        await ctx.reply("İstersen tümünü tek seferde onaylayabilirsin.", {
          reply_markup: batchConfirmationKeyboard(pendingIds),
        });
      }
      return;
    }
    if (isPdfRequest(lower)) {
      await sendPdfReport(ctx, lower, today);
      return;
    }
    if (isAnalyticsRequest(lower)) {
      await ctx.reply(handleAnalytics(ctx, lower, today));
      return;
    }
    if (isSummary(lower)) {
      await ctx.reply(handleSummary(ctx, lower, today));
      return;
    }
    if (isDuplicateRequest(lower)) {
      await ctx.reply(handleDuplicates(ctx));
      return;
    }
    if (isListRequest(lower)) {
      await ctx.reply(handleList(ctx, lower, today));
      return;
    }
    if (isDeleteRequest(lower)) {
      const category = categoryFromText(lower);
      const found = ctx.services.report.last(deleteCandidateLimit(lower), category);
      if (found.length === 0) {
        await ctx.reply("Silinecek gider bulunamadı.");
      } else if (found.length === 1) {
        const expense = found[0];
        if (!expense) return;
        await ctx.reply(`Bu gider silinsin mi?\n\n${expenseLine(expense, 1)}`, {
          reply_markup: deleteConfirmationKeyboard(expense.id),
        });
      } else {
        await ctx.reply(
          `Hangi gider silinsin?\n\n${found.map((expense, index) => expenseLine(expense, index + 1)).join("\n\n")}`,
          {
            reply_markup: deletePickKeyboard(found.map((expense) => expense.id)),
          },
        );
      }
      return;
    }
    if (isUpdateRequest(lower)) {
      if (await handleDirectIdUpdate(ctx, text, lower, today)) return;
      const last = ctx.services.report.last(1)[0];
      const amount = parseAmount(text);
      if (!last) {
        await ctx.reply("Güncellenecek gider bulunamadı.");
        return;
      }
      if (amount) {
        const pendingUpdateId = ctx.services.expense.createPendingAmountUpdate(
          last.id,
          amount.amountMinor,
          amount.currency,
        );
        await ctx.reply(
          `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(last, 1)}\n\nYeni tutar: ${formatMinorUnit(amount.amountMinor, amount.currency)}`,
          {
            reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId),
          },
        );
        return;
      }
      if (lower.includes("kategori")) {
        const category = matchCategory(text);
        const pendingUpdateId = ctx.services.expense.createPendingCategoryUpdate(last.id, category);
        await ctx.reply(
          `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(last, 1)}\n\nYeni kategori: ${category}`,
          {
            reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId),
          },
        );
        return;
      }
      if (lower.includes("açıklama") || lower.includes("aciklama")) {
        const description = text
          .replace(/son .*?(açıklamasını|aciklamasini)/iu, "")
          .replace(/\s+yap\s*$/iu, "")
          .trim();
        if (description.length > 0) {
          const pendingUpdateId = ctx.services.expense.createPendingDescriptionUpdate(
            last.id,
            description,
          );
          await ctx.reply(
            `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(last, 1)}\n\nYeni açıklama: ${description}`,
            {
              reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId),
            },
          );
          return;
        }
      }
      await ctx.reply("Güncellenecek alanı anlayamadım.");
      return;
    }
    const draft = applyAliases(
      ctx,
      await ctx.services.parser.parseExpense(
        text,
        ctx.message.message_id,
        today,
        ctx.env.DEFAULT_TIMEZONE,
      ),
    );
    if (!draft) {
      await ctx.reply(unknownMessage());
      return;
    }
    const pending = ctx.services.expense.createPending(draft);
    await ctx.reply(expensePreview(pending), {
      reply_markup: expenseConfirmationKeyboard(pending.id),
    });
  });
}

export function isSummary(lower: string): boolean {
  return (
    lower.includes("ne kadar") ||
    lower.includes("toplam") ||
    lower.includes("kaç para") ||
    lower.includes("kac para") ||
    lower.includes("kaç tl") ||
    lower.includes("kac tl") ||
    lower.includes("masrafım ne") ||
    lower.includes("masrafim ne") ||
    lower.includes("harcamam ne") ||
    lower.includes("giderim ne") ||
    lower.includes("kaça patladı") ||
    lower.includes("kaca patladi") ||
    lower.includes("ne tuttu") ||
    lower.includes("kaç tuttu") ||
    lower.includes("kac tuttu") ||
    lower.includes("raporu gönder") ||
    lower.includes("raporu gonder") ||
    lower.includes("raporunu gönder") ||
    lower.includes("raporunu gonder")
  );
}

export function isListRequest(lower: string): boolean {
  return (
    lower.includes("listele") ||
    lower.includes("göster") ||
    lower.includes("goster") ||
    lower.includes("harcamalarım") ||
    lower.includes("harcamalarim") ||
    lower.includes("giderlerim") ||
    lower.includes("neler harcadım") ||
    lower.includes("neler harcadim") ||
    lower.includes("ne harcadım") ||
    lower.includes("ne harcadim") ||
    lower.includes("dök") ||
    lower.includes("dok") ||
    lower.includes("sırala") ||
    lower.includes("sirala") ||
    lower.includes("kayıtları") ||
    lower.includes("kayitlari") ||
    lower.includes("işlemleri") ||
    lower.includes("islemleri") ||
    lower.includes("nereye para verdim") ||
    lower.includes("nerelere para verdim") ||
    lower.includes("hangi harcamalar") ||
    lower.includes("hangi giderler") ||
    lower.includes("sadece ") ||
    lower.includes("filtrele") ||
    lower.includes("olanlar") ||
    lower.includes("üstü") ||
    lower.includes("ustu") ||
    lower.includes("altı") ||
    lower.includes("alti")
  );
}

export function isPdfRequest(lower: string): boolean {
  return (
    lower.includes("pdf") ||
    lower.includes("ekstre") ||
    lower.includes("döküm") ||
    lower.includes("dokum")
  );
}

async function sendPdfReport(ctx: MyContext, lower: string, today: string): Promise<void> {
  const range = parseDateRangeFromText(lower, today) ?? {
    from: startOfMonth(today),
    to: today,
    label: "Bu ay",
  };
  const file = path.join(os.tmpdir(), `expenses-statement-${Date.now()}.pdf`);
  try {
    await ctx.services.pdfReport.createExpenseStatement({
      title: `${range.label} Gider Ekstresi`,
      periodLabel: `${range.from} - ${range.to}`,
      expenses: ctx.services.report.range(range.from, range.to, categoryFromText(lower)),
      outputPath: file,
    });
    await ctx.replyWithDocument(
      new InputFile(file, `gider-ekstresi-${range.from}-${range.to}.pdf`),
    );
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function handleList(ctx: MyContext, lower: string, today: string): string {
  const filter = listFilterFromText(lower, today);
  const limit = requestedLimit(lower);
  if (
    lower.includes("en yüksek") ||
    lower.includes("en yuksek") ||
    lower.includes("en büyük") ||
    lower.includes("en buyuk") ||
    lower.includes("en pahalı") ||
    lower.includes("en pahali")
  ) {
    return formatExpenseList(
      "En yüksek harcamalar",
      ctx.services.expenses.list({ ...filter, limit, orderByAmountDesc: true }),
    );
  }
  return formatExpenseList(
    listTitleFromFilter(lower, today),
    ctx.services.expenses.list({ ...filter, limit }),
  );
}

function handleSummary(ctx: MyContext, lower: string, today: string): string {
  const category = categoryFromText(lower);
  const range = parseDateRangeFromText(lower, today) ?? {
    from: today,
    to: today,
    label: "Bugün",
  };
  return formatTotals(
    `📊 ${range.label} giderlerin`,
    ctx.services.report.range(range.from, range.to, category),
  );
}

function handleAnalytics(ctx: MyContext, lower: string, today: string): string {
  if (isMerchantRankingRequest(lower)) {
    return handleMerchantRanking(ctx, lower, today);
  }
  const comparison = comparisonRangesFromText(lower, today);
  if (!comparison) {
    return "Karşılaştırmayı anlayamadım. Örnek: Bu ay geçen aya göre ne kadar arttı?";
  }
  const category = categoryFromText(lower);
  const current = ctx.services.report.range(
    comparison.current.from,
    comparison.current.to,
    category,
  );
  const previous = ctx.services.report.range(
    comparison.previous.from,
    comparison.previous.to,
    category,
  );
  return formatComparisonReport(
    comparison.previous.label,
    previous,
    comparison.current.label,
    current,
  );
}

function handleMerchantRanking(ctx: MyContext, lower: string, today: string): string {
  const range = parseDateRangeFromText(lower, today) ?? {
    from: startOfMonth(today),
    to: today,
    label: "Bu ay",
  };
  const category = categoryFromText(lower);
  const expenses = ctx.services.report.range(range.from, range.to, category);
  const rows = merchantRanking(expenses).slice(0, requestedLimit(lower));
  if (rows.length === 0) return `${range.label} işletme analizi\n\nKayıt bulunamadı.`;
  return `${range.label} en çok para verdiğin işletmeler\n\n${rows
    .map(
      (row, index) =>
        `${index + 1}. ${row.merchant}\n${row.count} işlem · ${formatMinorUnit(row.amountMinor, row.currency)}`,
    )
    .join("\n\n")}`;
}

export function comparisonRangesFromText(lower: string, today: string) {
  const monthPair = lower.match(
    /\b([a-zçğıöşü]+)(?:\s+(20\d{2}))?\s+(?:ve|ile)\s+([a-zçğıöşü]+)(?:\s+(20\d{2}))?\b/u,
  );
  if (monthPair?.[1] && monthPair[3]) {
    const first = monthRangeFromName(monthPair[1], monthPair[2] ?? today.slice(0, 4));
    const second = monthRangeFromName(
      monthPair[3],
      monthPair[4] ?? monthPair[2] ?? today.slice(0, 4),
    );
    if (first && second) return { previous: first, current: second };
  }
  if (
    (lower.includes("geçen ay") || lower.includes("gecen ay")) &&
    (lower.includes("bu ay") || lower.includes("bu ayın") || lower.includes("bu ayin"))
  ) {
    return { previous: previousMonthRange(today), current: currentMonthRange(today) };
  }
  if (
    (lower.includes("önceki ay") || lower.includes("onceki ay")) &&
    (lower.includes("bu ay") || lower.includes("bu ayın") || lower.includes("bu ayin"))
  ) {
    return { previous: previousMonthRange(today), current: currentMonthRange(today) };
  }
  return null;
}

function formatComparisonReport(
  previousLabel: string,
  previous: Expense[],
  currentLabel: string,
  current: Expense[],
): string {
  const currencies = new Set([...previous, ...current].map((expense) => expense.currency));
  if (currencies.size === 0) {
    return `${previousLabel} / ${currentLabel} karşılaştırması\n\nİki dönemde de kayıt bulunamadı.`;
  }
  const lines = [...currencies].map((currency) => {
    const before = sumByCurrency(previous, currency);
    const after = sumByCurrency(current, currency);
    const diff = after - before;
    const direction = diff > 0 ? "arttı" : diff < 0 ? "azaldı" : "değişmedi";
    const percent = before > 0 ? ` · %${Math.abs((diff / before) * 100).toFixed(1)}` : "";
    return `${currency}\n${previousLabel}: ${formatMinorUnit(before, currency)}\n${currentLabel}: ${formatMinorUnit(after, currency)}\nFark: ${formatMinorUnit(Math.abs(diff), currency)} ${direction}${percent}`;
  });
  const categoryLines = topCategoryDeltas(previous, current).slice(0, 5);
  return `${previousLabel} / ${currentLabel} karşılaştırması\n\n${lines.join("\n\n")}${
    categoryLines.length ? `\n\nKategori farkları\n${categoryLines.join("\n")}` : ""
  }`;
}

async function handleDirectIdUpdate(
  ctx: MyContext,
  text: string,
  lower: string,
  today: string,
): Promise<boolean> {
  const match = lower.match(/#(\d+)\s+(.+)$/u);
  if (!match?.[1] || !match[2]) return false;

  const expenseId = Number(match[1]);
  const current = ctx.services.expenses.findById(expenseId);
  if (!current || current.deletedAt) {
    await ctx.reply(`#${expenseId} numaralı aktif gider bulunamadı.`);
    return true;
  }

  const originalTail = text.replace(/^.*?#\d+\s*/u, "").trim();
  const tail = match[2].trim();
  const amount = parseAmount(tail);
  if (
    amount &&
    hasFieldWord(tail, ["tutar", "tutarı", "tutarını", "fiyat", "fiyatı", "ucret", "ücret"])
  ) {
    const pendingUpdateId = ctx.services.expense.createPendingAmountUpdate(
      expenseId,
      amount.amountMinor,
      amount.currency,
    );
    await ctx.reply(
      `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(current, 1)}\n\nYeni tutar: ${formatMinorUnit(amount.amountMinor, amount.currency)}`,
      { reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId) },
    );
    return true;
  }

  if (hasFieldWord(tail, ["kategori", "kategorisi", "kategorisini"])) {
    const value = cleanUpdateValue(originalTail, /(kategori(?:si|sini)?)/iu);
    const category = parseCategoryName(value) ?? matchCategory(value);
    if (category === "Diğer" && !parseCategoryName(value)) {
      await ctx.reply(`Kategori anlaşılmadı. Örnek: #${expenseId} kategorisini Teknoloji yap`);
      return true;
    }
    const pendingUpdateId = ctx.services.expense.createPendingCategoryUpdate(expenseId, category);
    await ctx.reply(
      `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(current, 1)}\n\nYeni kategori: ${category}`,
      { reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId) },
    );
    return true;
  }

  if (hasFieldWord(tail, ["açıklama", "aciklama", "açıklamasını", "aciklamasini"])) {
    const description = cleanUpdateValue(
      originalTail,
      /(açıklama(?:sını|sı)?|aciklama(?:sini|si)?)/iu,
    );
    if (!description) {
      await ctx.reply(
        `Açıklama boş olamaz. Örnek: #${expenseId} açıklamasını Epic Games Spider-Man yap`,
      );
      return true;
    }
    const pendingUpdateId = ctx.services.expense.createPendingDescriptionUpdate(
      expenseId,
      description,
    );
    await ctx.reply(
      `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(current, 1)}\n\nYeni açıklama: ${description}`,
      { reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId) },
    );
    return true;
  }

  if (hasFieldWord(tail, ["tarih", "tarihi", "tarihini"])) {
    const value = cleanUpdateValue(originalTail, /(tarih(?:i|ini)?)/iu);
    const range = parseDateRangeFromText(value, today);
    if (!range || range.from !== range.to) {
      await ctx.reply(`Tarih anlaşılmadı. Örnek: #${expenseId} tarihini 1 Ağustos 2026 yap`);
      return true;
    }
    const expenseDate = range.from;
    const pendingUpdateId = ctx.services.expense.createPendingDateUpdate(expenseId, expenseDate);
    await ctx.reply(
      `Bu gider güncellensin mi?\n\nEski kayıt:\n${expenseLine(current, 1)}\n\nYeni tarih: ${expenseDate}`,
      { reply_markup: updateAmountConfirmationKeyboard(pendingUpdateId) },
    );
    return true;
  }

  await ctx.reply(
    `#${expenseId} için güncellenecek alanı anlayamadım. Örnek: #${expenseId} açıklamasını Epic Games Spider-Man yap`,
  );
  return true;
}

function handleDuplicates(ctx: MyContext): string {
  const groups = duplicateGroups(ctx.services.expenses.list({ limit: 500 }));
  if (groups.length === 0) return "Tekrar eden kayıt adayı bulunamadı.";
  return `Tekrar eden kayıt adayları\n\n${groups
    .slice(0, 10)
    .map((group, groupIndex) =>
      [
        `Grup ${groupIndex + 1}`,
        ...group.map((expense, index) => expenseLine(expense, index + 1)),
      ].join("\n"),
    )
    .join("\n\n")}`;
}

async function handlePendingCorrection(
  ctx: MyContext,
  text: string,
  lower: string,
  today: string,
): Promise<boolean> {
  const pending = ctx.services.expense.latestPending();
  if (!pending) return false;

  const patch: Parameters<MyContext["services"]["expense"]["updatePending"]>[1] = {};
  const amount = parseAmount(text);
  if (amount && isAmountOnlyCorrection(lower)) {
    patch.amountMinor = amount.amountMinor;
    patch.currency = amount.currency;
  } else if (hasFieldWord(lower, ["tutar", "tutarı", "tutarını", "fiyat", "fiyatı", "ucret", "ücret"])) {
    if (!amount) return false;
    patch.amountMinor = amount.amountMinor;
    patch.currency = amount.currency;
  } else if (hasFieldWord(lower, ["kategori", "kategorisi", "kategorisini"])) {
    const value = cleanUpdateValue(text, /(kategori(?:si|sini)?)/iu);
    patch.category = parseCategoryName(value) ?? matchCategory(value);
  } else if (hasFieldWord(lower, ["tarih", "tarihi", "tarihini"])) {
    const value = cleanUpdateValue(text, /(tarih(?:i|ini)?)/iu);
    const range = parseDateRangeFromText(value, today);
    if (!range || range.from !== range.to) return false;
    patch.expenseDate = range.from;
  } else if (hasFieldWord(lower, ["işletme", "isletme"])) {
    const merchant = cleanUpdateValue(text, /(işletme(?:si|sini)?|isletme(?:si|sini)?)/iu);
    if (!merchant) return false;
    patch.merchant = merchant;
  } else if (hasFieldWord(lower, ["açıklama", "aciklama", "açıklamasını", "aciklamasini"])) {
    const description = cleanUpdateValue(
      text,
      /(açıklama(?:sını|sı)?|aciklama(?:sini|si)?)/iu,
    );
    patch.description = description || null;
  } else {
    return false;
  }

  const updated = ctx.services.expense.updatePending(pending.id, patch);
  await ctx.reply(`Bekleyen gideri düzelttim.\n\n${expensePreview(updated)}`, {
    reply_markup: expenseConfirmationKeyboard(updated.id),
  });
  return true;
}

function isAmountOnlyCorrection(lower: string): boolean {
  const amount = parseAmount(lower);
  if (!amount) return false;
  const rest = lower
    .replace(amount.rawAmount.toLocaleLowerCase("tr-TR"), " ")
    .replace(/\b(?:olsun|yap|yapsana|olarak|diye|düzelt|duzelt|değiştir|degistir)\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return rest.length === 0;
}

export function duplicateGroups(expenses: Expense[]): Expense[][] {
  const groups = new Map<string, typeof expenses>();
  for (const expense of expenses) {
    const merchant = (expense.merchant ?? "").toLocaleLowerCase("tr-TR").trim();
    const description = (expense.description ?? "").toLocaleLowerCase("tr-TR").trim();
    const identity =
      merchant || description || expense.rawMessage.toLocaleLowerCase("tr-TR").trim();
    const key = [
      expense.expenseDate,
      expense.currency,
      expense.amountMinor,
      expense.category,
      identity.replace(/\s+/gu, " "),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), expense]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function isDuplicateRequest(lower: string): boolean {
  return (
    (lower.includes("tekrar") || lower.includes("mükerrer") || lower.includes("mukerrer")) &&
    (lower.includes("kayıt") ||
      lower.includes("kayit") ||
      lower.includes("harcama") ||
      lower.includes("gider"))
  );
}

function hasFieldWord(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function cleanUpdateValue(originalTail: string, fieldPattern: RegExp): string {
  return originalTail
    .replace(fieldPattern, "")
    .replace(/\b(?:olarak|diye)\b/giu, "")
    .replace(/\s+(?:yap|yapsana|değiştir|degistir|güncelle|guncelle|düzelt|duzelt)\s*$/iu, "")
    .trim();
}

function categoryFromText(lower: string) {
  const category = matchCategory(lower);
  return category === "Diğer" && !lower.includes("diğer") && !lower.includes("diger")
    ? undefined
    : category;
}

function listFilterFromText(lower: string, today: string): ExpenseFilter {
  const range = parseDateRangeFromText(lower, today);
  const category = categoryFromText(lower);
  const search = searchTermFromText(lower);
  return {
    ...(range ? { from: range.from, to: range.to } : {}),
    ...(category ? { category } : {}),
    ...(search ? { merchantLike: search } : {}),
    ...amountFilterFromText(lower),
  };
}

function listTitleFromFilter(lower: string, today: string): string {
  const range = parseDateRangeFromText(lower, today);
  if (searchTermFromText(lower)) return "Arama sonuçları";
  if (range) return `${range.label} harcamaların`;
  if (Object.keys(amountFilterFromText(lower)).length > 0) return "Tutar filtresi";
  return "Harcamalar";
}

function amountFilterFromText(
  lower: string,
): Pick<ExpenseFilter, "minAmountMinor" | "maxAmountMinor"> {
  const amount = parseAmount(lower);
  if (!amount) return {};
  if (
    lower.includes("üstü") ||
    lower.includes("ustu") ||
    lower.includes("üzerindeki") ||
    lower.includes("uzerindeki") ||
    lower.includes("fazla") ||
    lower.includes("büyük") ||
    lower.includes("buyuk")
  ) {
    return { minAmountMinor: amount.amountMinor };
  }
  if (
    lower.includes("altı") ||
    lower.includes("alti") ||
    lower.includes("altındaki") ||
    lower.includes("altindaki") ||
    lower.includes("az") ||
    lower.includes("küçük") ||
    lower.includes("kucuk")
  ) {
    return { maxAmountMinor: amount.amountMinor };
  }
  return {};
}

export function isAnalyticsRequest(lower: string): boolean {
  return (
    lower.includes("karşılaştır") ||
    lower.includes("karsilastir") ||
    lower.includes("kıyasla") ||
    lower.includes("kiyasla") ||
    lower.includes("geçen aya göre") ||
    lower.includes("gecen aya gore") ||
    lower.includes("ne kadar arttı") ||
    lower.includes("ne kadar artti") ||
    lower.includes("ne kadar azaldı") ||
    lower.includes("ne kadar azaldi") ||
    isMerchantRankingRequest(lower)
  );
}

function isMerchantRankingRequest(lower: string): boolean {
  return (
    (lower.includes("en çok") || lower.includes("en cok")) &&
    (lower.includes("işletme") ||
      lower.includes("isletme") ||
      lower.includes("nerelere") ||
      lower.includes("kime"))
  );
}

function monthRangeFromName(monthName: string, year: string) {
  const probe = parseDateRangeFromText(`${monthName} ${year}`, `${year}-12-15`);
  return probe;
}

function currentMonthRange(today: string) {
  return { from: startOfMonth(today), to: today, label: "Bu ay" };
}

function previousMonthRange(today: string) {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const year = currentMonth === 1 ? currentYear - 1 : currentYear;
  const from = `${year}-${String(previousMonth).padStart(2, "0")}-01`;
  return { from, to: endOfMonth(from), label: "Geçen ay" };
}

function sumByCurrency(expenses: Expense[], currency: Expense["currency"]): number {
  return expenses
    .filter((expense) => expense.currency === currency)
    .reduce((total, expense) => total + expense.amountMinor, 0);
}

function merchantRanking(expenses: Expense[]) {
  const groups = new Map<
    string,
    { merchant: string; currency: Expense["currency"]; count: number; amountMinor: number }
  >();
  for (const expense of expenses) {
    const merchant = expense.merchant?.trim() || "İsimsiz işletme";
    const key = `${merchant.toLocaleLowerCase("tr-TR")}|${expense.currency}`;
    const current = groups.get(key) ?? {
      merchant,
      currency: expense.currency,
      count: 0,
      amountMinor: 0,
    };
    current.count += 1;
    current.amountMinor += expense.amountMinor;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

function topCategoryDeltas(previous: Expense[], current: Expense[]): string[] {
  const categories = new Set([...previous, ...current].map((expense) => expense.category));
  const rows = [...categories].map((category) => {
    const before = previous
      .filter((expense) => expense.category === category && expense.currency === "TRY")
      .reduce((total, expense) => total + expense.amountMinor, 0);
    const after = current
      .filter((expense) => expense.category === category && expense.currency === "TRY")
      .reduce((total, expense) => total + expense.amountMinor, 0);
    return { category, diff: after - before };
  });
  return rows
    .filter((row) => row.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .map((row) => {
      const direction = row.diff > 0 ? "arttı" : "azaldı";
      return `${row.category}: ${formatMinorUnit(Math.abs(row.diff), "TRY")} ${direction}`;
    });
}

export function isDeleteRequest(lower: string): boolean {
  return (
    lower.includes("sil") ||
    lower.includes("kaldır") ||
    lower.includes("kaldir") ||
    lower.includes("iptal et") ||
    lower.includes("çıkart") ||
    lower.includes("cikart") ||
    lower.includes("çıkar") ||
    lower.includes("cikar")
  );
}

export function isUpdateRequest(lower: string): boolean {
  return (
    lower.includes(" yap") ||
    lower.includes("değiştir") ||
    lower.includes("degistir") ||
    lower.includes("düzelt") ||
    lower.includes("duzelt") ||
    lower.includes("güncelle") ||
    lower.includes("guncelle") ||
    lower.includes("olarak değiştir") ||
    lower.includes("olarak degistir")
  );
}

export function requestedLimit(lower: string): number {
  const explicit =
    lower.match(/\bson\s+(\d{1,2})\b/u) ??
    lower.match(/\ben\s+(?:yüksek|yuksek|büyük|buyuk|pahalı|pahali)\s+(\d{1,2})\b/u);
  if (explicit?.[1]) {
    const parsed = Number(explicit[1]);
    if (Number.isInteger(parsed) && parsed > 0) return Math.min(parsed, 20);
  }
  return 10;
}

export function deleteCandidateLimit(lower: string): number {
  return lower.includes("son") ? 1 : 5;
}

async function handleAliasTeaching(ctx: MyContext, text: string, lower: string): Promise<boolean> {
  const categoryMatch = text.match(/^(.+?)\s+bundan sonra\s+(.+?)\s+olsun$/iu);
  if (categoryMatch?.[1] && categoryMatch[2]) {
    const category = parseCategoryName(categoryMatch[2]);
    if (category) {
      ctx.services.aliases.upsertCategoryAlias(categoryMatch[1], category);
      await ctx.reply(
        `Tamam. "${categoryMatch[1].trim()}" bundan sonra ${category} olarak eşleşecek.`,
      );
      return true;
    }
  }
  const merchantMatch = text.match(/^(.+?)\s+işletme olarak\s+(.+?)\s+olsun$/iu);
  if (merchantMatch?.[1] && merchantMatch[2]) {
    ctx.services.aliases.upsertMerchantAlias(merchantMatch[1], merchantMatch[2].trim());
    await ctx.reply(
      `Tamam. "${merchantMatch[1].trim()}" işletme olarak ${merchantMatch[2].trim()} görünecek.`,
    );
    return true;
  }
  if (lower.includes("bundan sonra")) {
    await ctx.reply("Kategori öğretmek için şöyle yaz: Container Beach bundan sonra Seyahat olsun");
    return true;
  }
  return false;
}

function applyAliases(
  ctx: MyContext,
  draft: Awaited<ReturnType<MyContext["services"]["parser"]["parseExpense"]>>,
) {
  if (!draft) return null;
  const categoryAlias = ctx.services.aliases.findCategory(draft.rawMessage);
  const merchantAlias = ctx.services.aliases.findMerchant(draft.rawMessage);
  return {
    ...draft,
    category: categoryAlias?.category ?? draft.category,
    merchant: merchantAlias?.merchant ?? draft.merchant,
  };
}

function searchTermFromText(lower: string): string | null {
  const match =
    lower.match(/^(.+?)\s+harcamalarını\s+göster$/u) ??
    lower.match(/^(.+?)\s+harcamalarımı\s+göster$/u) ??
    lower.match(/^(.+?)\s+giderlerini\s+göster$/u) ??
    lower.match(/^(.+?)\s+olanlar(?:ı)?(?:\s+göster)?$/u) ??
    lower.match(/^sadece\s+(.+?)(?:\s+göster)?$/u) ??
    lower.match(/^(.+?)\s+filtrele$/u);
  const term = match?.[1]?.trim();
  if (!term || parseAmount(term) || categoryFromText(term)) return null;
  return term.replace(/\b(?:harcama|harcamalar|gider|giderler|işlem|işlemler)\b/gu, "").trim();
}

function parseCategoryName(value: string) {
  const normalized = value.trim().toLocaleLowerCase("tr-TR");
  return CATEGORIES.find((category) => category.toLocaleLowerCase("tr-TR") === normalized) ?? null;
}

export function extractExpenseLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) =>
      line
        .trim()
        .replace(/^\s*(?:gider|harcama)(?:\s+olarak)?\s+şunları\s+ekle\s*:?\s*$/iu, "")
        .replace(/^\s*\d+\s*[-.)]\s*/u, "")
        .trim(),
    )
    .filter((line) => line.length > 0 && parseAmount(line) !== null);
}
