const NBSP = " ";

/** Formats integer tenge with non-breaking-space thousands and a ₸ suffix: 12 500 000 ₸. */
export function formatTenge(value: number): string {
  if (!Number.isFinite(value)) return `0${NBSP}₸`;
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${grouped}${NBSP}₸`;
}

/** Formats a percent with ru-locale decimals (comma), up to 2 fraction digits: 7% / 18,5%. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)}%`;
}

/** Parses a money string (spaces, ₸, NBSP) into an integer tenge value. Non-numeric → 0. */
export function parseTenge(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Parses a percent/rate-style input that may use a comma decimal separator
 * (ru-KZ locale). Keeps digits and the first separator, drops the rest and any
 * sign. Returns a finite number or 0.
 */
export function parseDecimalInput(raw: string): number {
  let seenDot = false;
  let out = "";
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
    } else if ((ch === "." || ch === ",") && !seenDot) {
      out += ".";
      seenDot = true;
    }
  }
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

/** Integer tenge amount for a given percent of cost. */
export function pctToAmount(cost: number, pct: number): number {
  return Math.round((cost * pct) / 100);
}

/** Percent of cost represented by an amount. Guards a zero cost. */
export function amountToPct(cost: number, amount: number): number {
  if (cost <= 0) return 0;
  return (amount / cost) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
