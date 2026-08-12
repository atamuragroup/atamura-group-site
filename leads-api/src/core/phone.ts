/**
 * Normalizes a Kazakhstan phone number to 11 digits starting with country code 7.
 * Handles 8-prefix (8707…→7707…), +7 formatting, and bare 10-digit mobiles.
 * Returns null if the input cannot be a valid KZ number.
 */
export function normalizeKzPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) return d;
  return null;
}

export function isValidKzPhone(raw: string): boolean {
  return normalizeKzPhone(raw) !== null;
}
