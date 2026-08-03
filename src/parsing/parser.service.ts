import type { ExpenseDraft } from "../expenses/expense.types.js";
import { logger } from "../shared/logger.js";
import type { AiExpenseParser } from "./openai-parser.js";
import { RuleBasedParser } from "./rule-based-parser.js";

export class ParserService {
  private readonly rules = new RuleBasedParser();
  constructor(private readonly aiParser: AiExpenseParser | null) {}

  async parseExpense(
    text: string,
    telegramMessageId: number,
    todayIso: string,
    timeZone: string,
  ): Promise<ExpenseDraft | null> {
    const rule = this.rules.parse(text, telegramMessageId, todayIso);
    if (rule && rule.parserConfidence >= 0.85) return rule;
    if (!this.aiParser) return rule;
    try {
      return (await this.aiParser.parse(text, telegramMessageId, todayIso, timeZone)) ?? rule;
    } catch (error) {
      logger.warn(
        {
          eventType: "openai_parse_failed",
          errorCode: error instanceof Error ? error.name : "unknown",
        },
        "OpenAI parse failed",
      );
      return rule;
    }
  }
}
