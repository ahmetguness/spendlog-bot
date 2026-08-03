import type { ExpenseDraft } from "../expenses/expense.types.js";
import { parseAmount } from "./amount-parser.js";
import { matchCategory } from "./category-matcher.js";
import { parseTurkishDate } from "./date-parser.js";

const DATE_WORDS =
  /\b(bugün|bugun|dün|dun|önceki gün|onceki gun|geçen|gecen|bu|pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|\d{1,2}\.\d{1,2}\.\d{4}|20\d{2}-\d{2}-\d{2}|\d{1,2}\s*[a-zçğıöşü']+(?:\s+20\d{2})?)\b/giu;

export class RuleBasedParser {
  parse(text: string, telegramMessageId: number, todayIso: string): ExpenseDraft | null {
    const amount = parseAmount(text);
    if (!amount) return null;
    const rest = cleanExpenseText(text, amount.rawAmount);
    const category = matchCategory(text);
    const merchant = inferMerchant(rest, category);
    return {
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      category,
      merchant,
      description: rest.length > 0 ? title(rest) : null,
      expenseDate: parseTurkishDate(text, todayIso),
      rawMessage: text,
      parserType: "rule",
      parserConfidence: category === "Diğer" ? 0.72 : 0.9,
      telegramMessageId,
    };
  }
}

function cleanExpenseText(text: string, rawAmount: string): string {
  return text
    .replace(rawAmount, " ")
    .replace(DATE_WORDS, " ")
    .replace(
      /(?:^|\s)(harcadım|harcadim|ödedim|odedim|aldım|aldim|satın aldım|satin aldim|yaptım|yaptim)(?=$|\s)/giu,
      " ",
    )
    .replace(/\b(?:liralık|liralik|liraya|lira)\b/giu, " ")
    .replace(/\b\d+\s*(?:günlük|gunluk)\b/giu, " ")
    .replace(/\b(günü|gunu|için|icin)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferMerchant(text: string, category: string): string | null {
  if (text.length === 0) return null;
  const titleCased = title(text);
  const beach = titleCased.match(
    /\b([A-ZÇĞİÖŞÜ][\p{L}'’.-]+\s+Beach(?:\s+[A-ZÇĞİÖŞÜ][\p{L}'’.-]+)?)\b/u,
  );
  if (beach?.[1]) return beach[1];
  if (category === "Oyun") {
    const gameStore = titleCased.match(/\b(Epic Games|Steam|Playstation|Xbox|Nintendo)\b/u);
    if (gameStore?.[1]) return gameStore[1];
  }
  if (category === "Benzin") {
    if (/\bPetrol\s+Ofisi(?:nden|den|ne|nde)?\b/u.test(titleCased)) return "Petrol Ofisi";
    const fuel = titleCased.match(/\b(Shell|Opet|Bp|Total|Aytemiz)\b/u);
    if (fuel?.[1]) return fuel[1] === "Bp" ? "BP" : fuel[1];
  }
  if (category === "Abonelik") {
    const subscription = titleCased.match(
      /\b(Chatgpt|Openai|Netflix|Spotify|Youtube Premium|Icloud|Apple)\b/u,
    );
    if (subscription?.[1]) return subscription[1];
  }
  if (category === "Faturalar") {
    const biller = titleCased.match(/\b(Apple|Icloud|Elektrik|Su|Doğalgaz|Internet)\b/u);
    if (biller?.[1]) return biller[1];
  }
  return titleCased.split(" ").slice(0, 4).join(" ");
}

function title(value: string): string {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1))
    .join(" ");
}
