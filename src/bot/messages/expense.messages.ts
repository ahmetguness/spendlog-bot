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
  return `Bunu gider kaydı mı, rapor sorusu mu olarak okuyacağımı anlayamadım.

Harcama eklemek için:
Migros 850 TL
Dün 240 TL benzin
Netflix 12 euro

Rapor sormak için:
Bu ay kaç TL harcadım?
Geçen ay oyun harcamam var mı?
Bu ay yeme içme detaylarımı göster

Komutları görmek için /yardim yazabilirsin.`;
}

export function helpMessage(): string {
  return `Komutlar

/bugun - Bugünkü gider özeti
/hafta - Bu haftaki gider özeti
/ay - Bu ayki gider özeti
/son - Son 10 harcama
/kategoriler - Kategori listesi
/pdf - Bu ayın PDF ekstresi
/export - CSV dışa aktar
/backup - Veritabanı yedeği al

Doğal dil örnekleri

Migros 850 TL
Dün 240 TL benzin
Netflix 12 euro

Bu ay kaç TL harcadım?
Geçen ay oyun harcamam var mı?
Bu ay market giderlerine bak
Ağustosta teknolojiden ne almışım?

Silme ve düzeltme tarafında onay ister:
Son harcamayı sil
Son harcamayı 900 TL yap`;
}
