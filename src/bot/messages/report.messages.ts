import type { Expense } from "../../expenses/expense.types.js";
import { CATEGORY_EMOJI, type Currency, type ExpenseCategory } from "../../shared/constants.js";
import { formatMinorUnit } from "../../shared/money.js";
import { expenseLine } from "./expense.messages.js";

export function formatExpenseList(title: string, expenses: Expense[]): string {
  if (expenses.length === 0) return `${title}\n\nKayıt bulunamadı.`;
  return `${title}\n\n${expenses.map((expense, index) => expenseLine(expense, index + 1)).join("\n\n")}`;
}

export function formatTotals(title: string, expenses: Expense[]): string {
  const totals = new Map<Currency, number>();
  const categories = new Map<ExpenseCategory, { count: number; totals: Map<Currency, number> }>();
  for (const expense of expenses) {
    totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.amountMinor);
    const current = categories.get(expense.category) ?? {
      count: 0,
      totals: new Map<Currency, number>(),
    };
    current.count += 1;
    current.totals.set(
      expense.currency,
      (current.totals.get(expense.currency) ?? 0) + expense.amountMinor,
    );
    categories.set(expense.category, current);
  }
  const totalLines = [...totals.entries()].map(([currency, amount]) =>
    formatMinorUnit(amount, currency),
  );
  const categoryLines = [...categories.entries()].map(([category, data]) => {
    const amounts = [...data.totals.entries()]
      .map(([currency, amount]) => formatMinorUnit(amount, currency))
      .join(", ");
    return `${CATEGORY_EMOJI[category]} ${category}\n${data.count} işlem · ${amounts}`;
  });
  return `${title}\n\n${totalLines.length ? totalLines.join("\n") : "Kayıt bulunamadı."}${categoryLines.length ? `\n\n${categoryLines.join("\n\n")}` : ""}`;
}
