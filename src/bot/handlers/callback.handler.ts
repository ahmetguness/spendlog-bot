import type { Bot } from "grammy";
import type { MyContext } from "../create-bot.js";
import { CALLBACK_PREFIX } from "../../shared/constants.js";
import {
  deleteConfirmationKeyboard,
  expenseConfirmationWithUndoKeyboard,
  undoDeleteKeyboard,
  undoUpdateKeyboard,
} from "../keyboards/expense-confirmation.keyboard.js";
import { expenseLine } from "../messages/expense.messages.js";

export function registerCallbackHandlers(bot: Bot<MyContext>): void {
  bot.on("callback_query:data", async (ctx) => {
    const parts = ctx.callbackQuery.data.split(":");
    const [prefixA, prefixB, idRaw] = parts;
    const prefix = `${prefixA}:${prefixB}`;
    if (prefix === CALLBACK_PREFIX.confirmBatch || prefix === CALLBACK_PREFIX.cancelBatch) {
      const ids = parseIdList(idRaw);
      if (ids.length === 0) {
        await ctx.answerCallbackQuery("Geçersiz işlem.");
        return;
      }
      if (prefix === CALLBACK_PREFIX.confirmBatch) {
        let count = 0;
        for (const pendingId of ids) {
          if (ctx.services.expense.confirmPending(pendingId)) count += 1;
        }
        await ctx.answerCallbackQuery(`${count} gider kaydedildi.`);
        await ctx.editMessageText(`✅ ${count} gider kaydedildi.`);
      } else {
        for (const pendingId of ids) ctx.services.expense.cancelPending(pendingId);
        await ctx.answerCallbackQuery("İptal edildi.");
        await ctx.editMessageText("❌ Toplu giderler iptal edildi.");
      }
      return;
    }
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      await ctx.answerCallbackQuery("Geçersiz işlem.");
      return;
    }
    if (prefix === CALLBACK_PREFIX.confirmExpense) {
      const result = ctx.services.expense.confirmPending(id);
      await ctx.answerCallbackQuery(result ? "Kaydedildi." : "Bu onay artık geçerli değil.");
      await ctx.editMessageText(
        result ? "✅ Gider kaydedildi." : "Süresi dolmuş veya daha önce işlenmiş.",
        result ? { reply_markup: expenseConfirmationWithUndoKeyboard(result.undoId) } : undefined,
      );
      return;
    }
    if (prefix === CALLBACK_PREFIX.cancelExpense) {
      ctx.services.expense.cancelPending(id);
      await ctx.answerCallbackQuery("İptal edildi.");
      await ctx.editMessageText("❌ Gider iptal edildi.");
      return;
    }
    if (prefix === CALLBACK_PREFIX.confirmDelete) {
      const result = ctx.services.expense.softDeleteWithUndo(id);
      await ctx.answerCallbackQuery("Silindi.");
      await ctx.editMessageText("🗑️ Gider silindi.", {
        reply_markup: undoDeleteKeyboard(result.undoId),
      });
      return;
    }
    if (prefix === CALLBACK_PREFIX.pickDelete) {
      const expense = ctx.services.expenses.findById(id);
      if (!expense || expense.deletedAt) {
        await ctx.answerCallbackQuery("Gider bulunamadı.");
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`Bu gider silinsin mi?\n\n${expenseLine(expense, 1)}`, {
        reply_markup: deleteConfirmationKeyboard(id),
      });
      return;
    }
    if (prefix === CALLBACK_PREFIX.confirmUpdate) {
      const result = ctx.services.expense.confirmPendingUpdate(id);
      await ctx.answerCallbackQuery(result ? "Güncellendi." : "Bu onay artık geçerli değil.");
      await ctx.editMessageText(
        result
          ? `✅ Güncellendi.\n\n${expenseLine(result.expense, 1)}`
          : "Süresi dolmuş veya daha önce işlenmiş.",
        result ? { reply_markup: undoUpdateKeyboard(result.undoId) } : undefined,
      );
      return;
    }
    if (
      prefix === CALLBACK_PREFIX.undoCreate ||
      prefix === CALLBACK_PREFIX.undoDelete ||
      prefix === CALLBACK_PREFIX.undoUpdate
    ) {
      const expense = ctx.services.expense.undoAction(id);
      await ctx.answerCallbackQuery(expense ? "Geri alındı." : "Geri alma süresi dolmuş.");
      await ctx.editMessageText(expense ? "↩️ İşlem geri alındı." : "Geri alma süresi dolmuş.");
      return;
    }
    if (prefix === CALLBACK_PREFIX.cancelDelete || prefix === CALLBACK_PREFIX.cancelUpdate) {
      if (prefix === CALLBACK_PREFIX.cancelUpdate) ctx.services.expense.cancelPendingUpdate(id);
      await ctx.answerCallbackQuery("Vazgeçildi.");
      await ctx.editMessageText("İşlem iptal edildi.");
      return;
    }
    await ctx.answerCallbackQuery("Bilinmeyen işlem.");
  });
}

function parseIdList(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}
