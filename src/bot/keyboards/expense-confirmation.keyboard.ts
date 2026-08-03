import { InlineKeyboard } from "grammy";
import { CALLBACK_PREFIX } from "../../shared/constants.js";

export function expenseConfirmationKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Kaydet", `${CALLBACK_PREFIX.confirmExpense}:${id}`)
    .text("❌ İptal", `${CALLBACK_PREFIX.cancelExpense}:${id}`);
}

export function expenseConfirmationWithUndoKeyboard(undoId: number): InlineKeyboard {
  return new InlineKeyboard().text("↩️ Geri al", `${CALLBACK_PREFIX.undoCreate}:${undoId}`);
}

export function undoDeleteKeyboard(undoId: number): InlineKeyboard {
  return new InlineKeyboard().text("↩️ Geri al", `${CALLBACK_PREFIX.undoDelete}:${undoId}`);
}

export function undoUpdateKeyboard(undoId: number): InlineKeyboard {
  return new InlineKeyboard().text("↩️ Geri al", `${CALLBACK_PREFIX.undoUpdate}:${undoId}`);
}

export function batchConfirmationKeyboard(ids: number[]): InlineKeyboard {
  const joined = ids.slice(0, 10).join(",");
  return new InlineKeyboard()
    .text("✅ Hepsini kaydet", `${CALLBACK_PREFIX.confirmBatch}:${joined}`)
    .text("❌ Hepsini iptal", `${CALLBACK_PREFIX.cancelBatch}:${joined}`);
}

export function deleteConfirmationKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑️ Sil", `${CALLBACK_PREFIX.confirmDelete}:${id}`)
    .text("❌ Vazgeç", `${CALLBACK_PREFIX.cancelDelete}:${id}`);
}

export function updateConfirmationKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Güncelle", `${CALLBACK_PREFIX.confirmUpdate}:${id}`)
    .text("❌ Vazgeç", `${CALLBACK_PREFIX.cancelUpdate}:${id}`);
}

export function updateAmountConfirmationKeyboard(pendingUpdateId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Güncelle", `${CALLBACK_PREFIX.confirmUpdate}:${pendingUpdateId}`)
    .text("❌ Vazgeç", `${CALLBACK_PREFIX.cancelUpdate}:${pendingUpdateId}`);
}

export function deletePickKeyboard(expenseIds: number[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const [index, id] of expenseIds.entries()) {
    keyboard.text(`${index + 1}`, `${CALLBACK_PREFIX.pickDelete}:${id}`);
  }
  return keyboard;
}
