import { isValidKzPhone } from "./phone";

/** Lead submitted from the calculator. Shared by the client form and the server handler. */
export interface LeadPayload {
  name: string;
  phone: string;
  cost: number;
  downPayment: number;
  programId: string;
  programName: string;
  annualRatePercent: number;
  termMonths: number;
  monthlyPayment: number;
  /** ЖК slug or "calculator" / "embed" — where the lead came from. */
  source: string;
  /** Mandatory consent to personal-data processing (РК ПДн law). */
  consent: boolean;
}

export type LeadErrorField =
  | "name"
  | "phone"
  | "consent"
  | "cost"
  | "downPayment"
  | "termMonths"
  | "annualRatePercent"
  | "programName"
  | "programId"
  | "source";

export interface LeadValidation {
  ok: boolean;
  errors: ReadonlyArray<LeadErrorField>;
}

/** Length caps for free-text fields (DoS / CRM-poisoning guard). */
export const LEAD_LIMITS = { name: 120, phone: 32, programName: 160, programId: 64, source: 64 } as const;
/** Numeric bounds for the persisted/forwarded calculation fields. */
export const LEAD_BOUNDS = { termMin: 1, termMax: 600, rateMin: 0, rateMax: 100 } as const;

const cappedString = (v: unknown, max: number): boolean =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validateLead(p: Partial<LeadPayload>): LeadValidation {
  const errors: LeadErrorField[] = [];
  // Body is untrusted JSON — type-check before any string/number operation.
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > LEAD_LIMITS.name) {
    errors.push("name");
  }
  if (typeof p.phone !== "string" || p.phone.length > LEAD_LIMITS.phone || !isValidKzPhone(p.phone)) {
    errors.push("phone");
  }
  if (p.consent !== true) errors.push("consent");
  if (typeof p.cost !== "number" || !Number.isFinite(p.cost) || p.cost <= 0) {
    errors.push("cost");
  }
  // Every persisted/CRM-forwarded field is untrusted too — bound them so a direct
  // POST can't poison the lead store, Telegram, or Bitrix with garbage/oversized data.
  if (
    typeof p.downPayment !== "number" ||
    !Number.isFinite(p.downPayment) ||
    p.downPayment < 0 ||
    (typeof p.cost === "number" && p.downPayment > p.cost)
  ) {
    errors.push("downPayment");
  }
  if (
    typeof p.termMonths !== "number" ||
    !Number.isInteger(p.termMonths) ||
    p.termMonths < LEAD_BOUNDS.termMin ||
    p.termMonths > LEAD_BOUNDS.termMax
  ) {
    errors.push("termMonths");
  }
  if (
    typeof p.annualRatePercent !== "number" ||
    !Number.isFinite(p.annualRatePercent) ||
    p.annualRatePercent < LEAD_BOUNDS.rateMin ||
    p.annualRatePercent > LEAD_BOUNDS.rateMax
  ) {
    errors.push("annualRatePercent");
  }
  if (!cappedString(p.programName, LEAD_LIMITS.programName)) errors.push("programName");
  if (!cappedString(p.programId, LEAD_LIMITS.programId)) errors.push("programId");
  if (!cappedString(p.source, LEAD_LIMITS.source)) errors.push("source");
  return { ok: errors.length === 0, errors };
}
