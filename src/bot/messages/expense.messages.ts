import type { Expense, PendingExpense } from "../../expenses/expense.types.js";
import { CATEGORY_EMOJI } from "../../shared/constants.js";
import { formatDateTr } from "../../shared/dates.js";
import { formatMinorUnit } from "../../shared/money.js";

export function expensePreview(expense: PendingExpense): string {
  return `🧾 Gider kaydı

💰 Tutar: ${formatMinorUnit(expense.amountMinor, expense.currency)}
📁 Kategori: ${CATEGORY_EMOJI[expense.category]} ${expense.category}
🏪 İşletme: ${expense.merchant ?? "-"}
📝 Açıklama: ${expense.description ?? "-"}
📅 Tarih: ${formatDateTr(expense.expenseDate)}

Bu gider kaydedilsin mi?`;
}

export function expenseLine(expense: Expense, index: number): string {
  const name = expense.merchant ?? expense.description ?? expense.category;
  return `${index}. ${CATEGORY_EMOJI[expense.category]} ${name} - ${formatMinorUnit(expense.amountMinor, expense.currency)}
   ${formatDateTr(expense.expenseDate)} · ${expense.category} · #${expense.id}`;
}

export function unknownMessage(): string {
  return `Mesajı anlayamadım. Şöyle yazabilirsin:

Migros 850 TL
Dün 240 TL benzin
Netflix 12 euro`;
}
