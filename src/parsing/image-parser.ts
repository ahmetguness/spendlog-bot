import OpenAI from "openai";
import type { ExpenseDraft } from "../expenses/expense.types.js";
import { CATEGORIES, CURRENCIES } from "../shared/constants.js";
import { ExternalServiceError } from "../shared/errors.js";
import { parseMoneyToMinorUnit } from "../shared/money.js";
import { BankImageParseSchema, type BankImageExpense } from "./parsing.schemas.js";

export class ImageParseError extends Error {
  constructor(
    message: string,
    readonly reason: "model" | "schema" | "amount" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "ImageParseError";
  }
}

export class OpenAiBankImageParser {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly maxExpenses: number,
    private readonly minConfidence: number,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async parseExpenseImage(
    image: { base64: string; mimeType: string },
    telegramMessageId: number,
    todayIso: string,
    timeZone: string,
  ): Promise<ExpenseDraft[]> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content: `You are a high-accuracy OCR and expense extraction engine for Turkish personal finance images. Today is ${todayIso}; timezone is ${timeZone}. The image may be a bank app screenshot, a shopping receipt, or multiple visible receipt/transaction panels.

For bank screenshots: first read each visible transaction card/row exactly, then extract only outgoing spending transactions such as POS/card purchases, virtual POS purchases, bills, fees, or subscriptions. Ignore incoming money, transfers between own accounts, remaining balances (Kalan Bakiye), card numbers, IBANs, account numbers, masked card numbers, and customer names.

For shopping receipts: extract one expense per receipt using the final payable/grand total only. Prefer fields labeled GENEL TOPLAM, TOPLAM, NAKIT, KREDI/KREDİ KARTI, BANKA/KART, or payable total. Do not create separate expenses for product line items, VAT/KDV subtotals, discounts, or change/para üstü. If multiple receipts are clearly visible, return one expense for each receipt.

Do not infer hidden or truncated text beyond what is visible. If amount or merchant cannot be read confidently, omit that expense instead of guessing. If the receipt date is not readable, use today's date only when the receipt appears to be a current purchase and no conflicting date is visible; otherwise omit it. Preserve the visible transaction/receipt OCR text in rawTransactionText, but exclude balances and card/account numbers. Return at most ${this.maxExpenses} expenses. Categories: ${CATEGORIES.join(", ")}. Currencies: ${CURRENCIES.join(", ")}.`,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Extract visible expenses from this image. If it is a bank screenshot, use outgoing spending rows only and convert negative amounts to positive expense amounts. If it is a shopping receipt, create exactly one expense for the receipt grand total, not product lines. Keep Turkish decimal formatting. rawTransactionText must be the exact visible OCR text for the relevant row or receipt total area, with balances and masked card numbers removed. Return no expense if you are unsure.",
              },
              {
                type: "input_image",
                image_url: `data:${image.mimeType};base64,${image.base64}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bank_image_expense_parse",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                sourceType: { enum: ["bank_screenshot", "receipt", "unknown"] },
                expenses: {
                  type: "array",
                  maxItems: this.maxExpenses,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      amount: { type: "string" },
                      currency: { enum: CURRENCIES },
                      category: { enum: [...CATEGORIES, null] },
                      merchant: { type: ["string", "null"] },
                      description: { type: ["string", "null"] },
                      expenseDate: { type: "string" },
                      rawTransactionText: { type: "string" },
                      confidence: { type: "number" },
                    },
                    required: [
                      "amount",
                      "currency",
                      "category",
                      "merchant",
                      "description",
                      "expenseDate",
                      "rawTransactionText",
                      "confidence",
                    ],
                  },
                },
              },
              required: ["sourceType", "expenses"],
            },
          },
        },
      });

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(response.output_text);
      } catch {
        throw new ImageParseError("Image parser returned invalid JSON", "schema");
      }
      const parsed = BankImageParseSchema.safeParse(parsedJson);
      if (!parsed.success) throw new ImageParseError("Image parser schema mismatch", "schema");
      if (parsed.data.sourceType === "unknown") return [];
      return parsed.data.expenses
        .filter((expense) => expense.confidence >= this.minConfidence)
        .filter((expense) => sanitizeMerchant(expense.merchant) !== null)
        .filter(uniqueTransaction)
        .slice(0, this.maxExpenses)
        .map((expense, index) => ({
          amountMinor: parseMoneyToMinorUnit(normalizeBankAmount(expense.amount)),
          currency: expense.currency,
          category: expense.category ?? "Diğer",
          merchant: sanitizeMerchant(expense.merchant),
          description: sanitizeDescription(expense.description),
          expenseDate: expense.expenseDate,
          rawMessage: `Görsel gider: ${sanitizeRawTransactionText(expense.rawTransactionText)}`,
          parserType: "openai",
          parserConfidence: expense.confidence,
          telegramMessageId: telegramMessageId * 1000 + index + 1,
        }));
    } catch (error) {
      if (error instanceof ImageParseError) {
        throw new ExternalServiceError(`${error.reason}: ${error.message}`);
      }
      throw new ExternalServiceError(
        classifyOpenAiImageError(error),
      );
    }
  }

  async parseBankScreenshot(
    image: { base64: string; mimeType: string },
    telegramMessageId: number,
    todayIso: string,
    timeZone: string,
  ): Promise<ExpenseDraft[]> {
    return this.parseExpenseImage(image, telegramMessageId, todayIso, timeZone);
  }
}

function classifyOpenAiImageError(error: unknown): string {
  const message = error instanceof Error ? error.message : "OpenAI image parse failed";
  const lower = message.toLocaleLowerCase("tr-TR");
  if (
    lower.includes("image") ||
    lower.includes("input_image") ||
    lower.includes("vision") ||
    lower.includes("unsupported") ||
    lower.includes("model")
  ) {
    return `model: ${message}`;
  }
  if (lower.includes("invalid amount")) return `amount: ${message}`;
  return `unknown: ${message}`;
}

function normalizeBankAmount(value: string): string {
  return value
    .replace(/^\s*[-−]\s*/u, "")
    .replace(/\b(?:tl|try|usd|eur|₺|\$|€)\b/giu, "")
    .replace(/[₺$€]/gu, "")
    .trim();
}

function uniqueTransaction(
  expense: BankImageExpense,
  index: number,
  expenses: BankImageExpense[],
): boolean {
  const key = transactionKey(expense);
  return expenses.findIndex((candidate) => transactionKey(candidate) === key) === index;
}

function transactionKey(expense: BankImageExpense): string {
  return [
    expense.expenseDate,
    normalizeBankAmount(expense.amount),
    expense.currency,
    sanitizeMerchant(expense.merchant)?.toLocaleLowerCase("tr-TR") ?? "",
    sanitizeRawTransactionText(expense.rawTransactionText).toLocaleLowerCase("tr-TR"),
  ].join("|");
}

function sanitizeMerchant(value: string | null): string | null {
  if (!value) return null;
  return sanitizeSensitiveText(value).slice(0, 120) || null;
}

function sanitizeDescription(value: string | null): string | null {
  if (!value) return null;
  return sanitizeSensitiveText(value).slice(0, 300) || null;
}

function sanitizeRawTransactionText(value: string): string {
  return sanitizeSensitiveText(value)
    .slice(0, 500);
}

function sanitizeSensitiveText(value: string): string {
  return value
    .replace(/\b(?:kalan\s+bakiye|bakiye)\s*:?\s*[-\d.,]+\s*(?:tl|try|usd|eur)?/giu, "")
    .replace(/\b\d{4}\s*(?:\*{2,}|\*\*\*\*)\s*(?:\*{2,}|\*\*\*\*)\s*\d{4}\b/gu, "")
    .replace(/\b(?:kart\s*no|iban|hesap\s*no)\s*:?\s*[\w\s*.-]+/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}
