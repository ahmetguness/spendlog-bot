import type { Currency } from "../shared/constants.js";
import { parseMoneyToMinorUnit } from "../shared/money.js";

export interface ParsedAmount {
  amountMinor: number;
  currency: Currency;
  rawAmount: string;
}

const AMOUNT_PATTERN = String.raw`(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const MONEY_WITH_CURRENCY_RE = new RegExp(
  String.raw`(?:(₺|\$|€)\s*${AMOUNT_PATTERN}|${AMOUNT_PATTERN}\s*(tl|try|lira|usd|dolar|eur|euro))`,
  "iu",
);
const BARE_MONEY_RE = new RegExp(AMOUNT_PATTERN, "iu");

export function parseAmount(text: string): ParsedAmount | null {
  const withCurrency = text.match(MONEY_WITH_CURRENCY_RE);
  if (withCurrency) {
    const symbol = withCurrency[1];
    const amount = withCurrency[2] ?? withCurrency[3];
    const suffix = withCurrency[4]?.toLocaleLowerCase("tr-TR");
    if (!amount) return null;
    return toParsedAmount(amount, withCurrency[0], symbol, suffix);
  }

  const bare = text.match(BARE_MONEY_RE);
  if (!bare?.[1]) return null;
  return toParsedAmount(bare[1], bare[0], undefined, undefined);
}

function toParsedAmount(
  amount: string,
  rawAmount: string,
  symbol: string | undefined,
  suffix: string | undefined,
): ParsedAmount {
  const currency: Currency =
    symbol === "$" || suffix === "usd" || suffix === "dolar"
      ? "USD"
      : symbol === "€" || suffix === "eur" || suffix === "euro"
        ? "EUR"
        : "TRY";
  return { amountMinor: parseMoneyToMinorUnit(amount), currency, rawAmount };
}
