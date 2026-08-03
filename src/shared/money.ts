import { CurrencySchema, type Currency } from "./constants.js";
import { ValidationError } from "./errors.js";

export function getCurrencySymbol(currency: Currency): string {
  return { TRY: "₺", USD: "$", EUR: "€" }[currency];
}

export function parseMoneyToMinorUnit(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "");
  if (!/^\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(cleaned)) {
    throw new ValidationError("Invalid amount");
  }
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = cleaned.replaceAll(thousandSep, "").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replaceAll(",", "");
  } else if (lastDot >= 0) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals <= 2 ? cleaned : cleaned.replaceAll(".", "");
  }
  const [majorRaw, minorRaw = ""] = normalized.split(".");
  if (!majorRaw || !/^\d+$/.test(majorRaw) || !/^\d{0,2}$/.test(minorRaw)) {
    throw new ValidationError("Invalid amount");
  }
  return Number(majorRaw) * 100 + Number(minorRaw.padEnd(2, "0"));
}

export function formatMinorUnit(amountMinor: number, currency: Currency): string {
  CurrencySchema.parse(currency);
  const major = Math.trunc(amountMinor / 100);
  const minor = Math.abs(amountMinor % 100)
    .toString()
    .padStart(2, "0");
  return `${getCurrencySymbol(currency)}${major.toLocaleString("tr-TR")},${minor}`;
}
