import OpenAI from "openai";
import type { ExpenseDraft } from "../expenses/expense.types.js";
import { CATEGORIES, CURRENCIES } from "../shared/constants.js";
import { ExternalServiceError } from "../shared/errors.js";
import { parseMoneyToMinorUnit } from "../shared/money.js";
import { StructuredParseSchema } from "./parsing.schemas.js";

export interface AiExpenseParser {
  parse(
    text: string,
    telegramMessageId: number,
    todayIso: string,
    timeZone: string,
  ): Promise<ExpenseDraft | null>;
}

export class OpenAiParser implements AiExpenseParser {
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async parse(
    text: string,
    telegramMessageId: number,
    todayIso: string,
    timeZone: string,
  ): Promise<ExpenseDraft | null> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content: `You parse Turkish personal expense messages. Return only allowed schema values. Today is ${todayIso}; timezone is ${timeZone}. Categories: ${CATEGORIES.join(", ")}. Currencies: ${CURRENCIES.join(", ")}.`,
          },
          { role: "user", content: text },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "expense_parse",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: {
                  enum: [
                    "create_expense",
                    "list_expenses",
                    "expense_summary",
                    "delete_expense",
                    "update_expense",
                    "unknown",
                  ],
                },
                amount: { type: ["string", "null"] },
                currency: { enum: [...CURRENCIES, null] },
                category: { enum: [...CATEGORIES, null] },
                merchant: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                expenseDate: { type: ["string", "null"] },
                confidence: { type: "number" },
                missingFields: { type: "array", items: { type: "string" } },
              },
              required: [
                "intent",
                "amount",
                "currency",
                "category",
                "merchant",
                "description",
                "expenseDate",
                "confidence",
                "missingFields",
              ],
            },
          },
        },
      });
      const content = response.output_text;
      const parsed = StructuredParseSchema.parse(JSON.parse(content));
      if (
        parsed.intent !== "create_expense" ||
        !parsed.amount ||
        !parsed.currency ||
        !parsed.expenseDate
      )
        return null;
      return {
        amountMinor: parseMoneyToMinorUnit(parsed.amount),
        currency: parsed.currency,
        category: parsed.category ?? "Diğer",
        merchant: parsed.merchant,
        description: parsed.description,
        expenseDate: parsed.expenseDate,
        rawMessage: text,
        parserType: "openai",
        parserConfidence: parsed.confidence,
        telegramMessageId,
      };
    } catch (error) {
      throw new ExternalServiceError(
        error instanceof Error ? error.message : "OpenAI parse failed",
      );
    }
  }
}
