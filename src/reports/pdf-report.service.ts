import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Expense } from "../expenses/expense.types.js";
import { CATEGORY_EMOJI, type Currency, type ExpenseCategory } from "../shared/constants.js";
import { formatDateTr } from "../shared/dates.js";
import { formatMinorUnit } from "../shared/money.js";

export interface PdfReportInput {
  title: string;
  periodLabel: string;
  expenses: Expense[];
  outputPath: string;
}

const PAGE = {
  margin: 42,
  width: 595.28,
  contentWidth: 511.28,
  bottom: 785,
};

const COLOR = {
  ink: "#17202A",
  muted: "#667085",
  line: "#D7DEE8",
  soft: "#F4F7FB",
  header: "#203A59",
  accent: "#0F766E",
  total: "#EAF7F4",
  month: "#FFF7E6",
};

export class PdfReportService {
  async createExpenseStatement(input: PdfReportInput): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE.margin,
        bufferPages: true,
        info: { Title: input.title },
      });
      const stream = fs.createWriteStream(input.outputPath);
      stream.on("finish", resolve);
      stream.on("error", reject);
      doc.on("error", reject);
      doc.pipe(stream);

      const fontPath = findUsableFont();
      if (fontPath) doc.font(fontPath);

      renderHeader(doc, input);
      renderTotals(doc, input.expenses);
      renderCategorySummary(doc, input.expenses);
      renderExpenseTable(doc, input.expenses);

      doc.end();
    });
  }
}

function renderHeader(doc: PDFKit.PDFDocument, input: PdfReportInput): void {
  doc.rect(0, 0, PAGE.width, 118).fill(COLOR.header);
  doc
    .fillColor("#FFFFFF")
    .fontSize(21)
    .text(input.title, PAGE.margin, 36, { width: PAGE.contentWidth });
  doc
    .fontSize(10)
    .fillColor("#DCE8F5")
    .text(`Dönem: ${input.periodLabel}`, PAGE.margin, 68, { width: PAGE.contentWidth });
  doc
    .fontSize(9)
    .fillColor("#DCE8F5")
    .text(`İşlem sayısı: ${input.expenses.length}`, PAGE.margin, 88, { width: PAGE.contentWidth });
  doc.y = 144;
  doc.fillColor(COLOR.ink);
}

function renderTotals(doc: PDFKit.PDFDocument, expenses: Expense[]): void {
  sectionTitle(doc, "Toplamlar");
  const totals = totalsByCurrency(expenses);
  if (totals.size === 0) {
    emptyBox(doc, "Bu dönem için gider kaydı bulunamadı.");
    return;
  }

  const cardWidth = 157;
  let x = PAGE.margin;
  const y = doc.y;
  for (const currency of ["TRY", "USD", "EUR"] satisfies Currency[]) {
    const amount = totals.get(currency) ?? 0;
    doc.roundedRect(x, y, cardWidth, 58, 6).fillAndStroke(COLOR.total, "#CBEAE4");
    doc
      .fillColor(COLOR.muted)
      .fontSize(9)
      .text(currency, x + 12, y + 10, { width: cardWidth - 24 });
    doc
      .fillColor(COLOR.ink)
      .fontSize(16)
      .text(formatMinorUnit(amount, currency), x + 12, y + 28, { width: cardWidth - 24 });
    x += cardWidth + 20;
  }
  doc.y = y + 78;
}

function renderCategorySummary(doc: PDFKit.PDFDocument, expenses: Expense[]): void {
  sectionTitle(doc, "Kategori Özeti");
  const categories = categoryTotals(expenses);
  if (categories.size === 0) {
    emptyBox(doc, "Kategori özeti için kayıt bulunamadı.");
    return;
  }

  for (const [category, data] of categories.entries()) {
    ensureSpace(doc, 30);
    const y = doc.y;
    doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 26, 4).fill(COLOR.soft);
    const amounts = [...data.totals.entries()]
      .map(([currency, amount]) => formatMinorUnit(amount, currency))
      .join(", ");
    doc
      .fillColor(COLOR.ink)
      .fontSize(10)
      .text(`${CATEGORY_EMOJI[category]} ${category}`, PAGE.margin + 10, y + 8, { width: 190 });
    doc
      .fillColor(COLOR.muted)
      .fontSize(9)
      .text(`${data.count} işlem`, PAGE.margin + 210, y + 8, { width: 70 });
    doc
      .fillColor(COLOR.ink)
      .fontSize(9)
      .text(amounts, PAGE.margin + 285, y + 8, { width: 215, align: "right" });
    doc.y = y + 34;
  }
}

function renderExpenseTable(doc: PDFKit.PDFDocument, expenses: Expense[]): void {
  sectionTitle(doc, "Detaylar");
  if (expenses.length === 0) {
    emptyBox(doc, "Detay listesi için kayıt bulunamadı.");
    return;
  }

  let currentMonth = "";
  expenses.forEach((expense, index) => {
    const month = monthYearLabel(expense.expenseDate);
    if (month !== currentMonth) {
      ensureSpace(doc, 64);
      renderMonthHeader(doc, month);
      renderTableHeader(doc);
      currentMonth = month;
    } else {
      ensureSpace(doc, 34);
    }

    const y = doc.y;
    if ((index + 1) % 2 === 0) {
      doc.rect(PAGE.margin, y - 5, PAGE.contentWidth, 28).fill(COLOR.soft);
    }
    const name = expense.merchant ?? expense.description ?? expense.category;
    doc.fillColor(COLOR.ink).fontSize(8.5);
    doc.text(formatDateTr(expense.expenseDate), PAGE.margin + 8, y, { width: 88 });
    doc.text(expense.category, PAGE.margin + 105, y, { width: 82 });
    doc.text(name, PAGE.margin + 197, y, { width: 190, ellipsis: true });
    doc.text(formatMinorUnit(expense.amountMinor, expense.currency), PAGE.margin + 397, y, {
      width: 105,
      align: "right",
    });
    doc.y = y + 28;
  });
}

function renderMonthHeader(doc: PDFKit.PDFDocument, label: string): void {
  const y = doc.y;
  doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 24, 4).fillAndStroke(COLOR.month, "#F4D48C");
  doc
    .fillColor(COLOR.header)
    .fontSize(10)
    .text(label, PAGE.margin + 10, y + 7, { width: PAGE.contentWidth - 20 });
  doc.y = y + 32;
}

function renderTableHeader(doc: PDFKit.PDFDocument): void {
  ensureSpace(doc, 42);
  const y = doc.y;
  doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 24, 4).fill(COLOR.header);
  doc.fillColor("#FFFFFF").fontSize(8.5);
  doc.text("Tarih", PAGE.margin + 8, y + 8, { width: 88 });
  doc.text("Kategori", PAGE.margin + 105, y + 8, { width: 82 });
  doc.text("İşletme / Açıklama", PAGE.margin + 197, y + 8, { width: 190 });
  doc.text("Tutar", PAGE.margin + 397, y + 8, { width: 105, align: "right" });
  doc.y = y + 34;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 45);
  doc.fillColor(COLOR.accent).fontSize(13).text(title, PAGE.margin, doc.y);
  doc
    .strokeColor(COLOR.line)
    .lineWidth(0.8)
    .moveTo(PAGE.margin, doc.y + 4)
    .lineTo(PAGE.width - PAGE.margin, doc.y + 4)
    .stroke();
  doc.moveDown(0.8);
}

function emptyBox(doc: PDFKit.PDFDocument, message: string): void {
  const y = doc.y;
  doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 38, 5).fillAndStroke(COLOR.soft, COLOR.line);
  doc
    .fillColor(COLOR.muted)
    .fontSize(10)
    .text(message, PAGE.margin + 12, y + 13);
  doc.y = y + 54;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE.bottom) {
    doc.addPage();
    doc.y = PAGE.margin;
  }
}

function totalsByCurrency(expenses: Expense[]): Map<Currency, number> {
  const totals = new Map<Currency, number>();
  for (const expense of expenses) {
    totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.amountMinor);
  }
  return totals;
}

function categoryTotals(
  expenses: Expense[],
): Map<ExpenseCategory, { count: number; totals: Map<Currency, number> }> {
  const categories = new Map<ExpenseCategory, { count: number; totals: Map<Currency, number> }>();
  for (const expense of expenses) {
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
  return categories;
}

function monthYearLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

function findUsableFont(): string | null {
  const candidates = [
    process.env.PDF_FONT_PATH,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (fs.existsSync(path.normalize(candidate))) return path.normalize(candidate);
  }
  return null;
}
