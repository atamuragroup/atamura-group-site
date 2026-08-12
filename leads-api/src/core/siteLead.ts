import { isValidKzPhone } from "./phone";

/**
 * Lead submitted by the static atamura.group site forms (form.lead-form in app.js).
 * Unlike the calculator's LeadPayload there is no cost/program/consent — the form
 * collects name+phone and the script enriches it with page/ref/utm/ts context.
 */
export interface SiteLeadPayload {
  name: string;
  phone: string;
  /** data-form attribute: "foot-cta" | "zk-<slug>" | … */
  source: string;
  page: string;
  ref: string;
  /** Raw UTM query string ("?utm_source=…"), kept for the human-readable summary. */
  utm: string;
  /** Discrete UTM params — mapped to Bitrix's native UTM_* lead fields. */
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  ts: string;
}

/** Length caps for free-text fields (DoS / CRM-poisoning guard). */
export const SITE_LEAD_LIMITS = {
  name: 120,
  phone: 32,
  source: 64,
  page: 256,
  ref: 512,
  utm: 512,
  utmSource: 256,
  utmMedium: 256,
  utmCampaign: 256,
  utmContent: 256,
  utmTerm: 256,
  ts: 40,
} as const;

// These fields end up as "Label: value" lines in Bitrix COMMENTS and Telegram —
// newlines/control chars would let a bot forge extra lines managers trust,
// bidi/zero-width chars would let it visually disguise them.
const CONTROL_RUNS = /[\u0000-\u001F\u007F]+/g;
const INVISIBLE = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

const capped = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max).replace(CONTROL_RUNS, " ").replace(INVISIBLE, "") : "";

/**
 * Normalizes an untrusted site-form body. Only the phone can reject a lead —
 * over-long context fields are truncated, wrong-typed ones dropped, so a junk
 * referrer or UTM string never costs us a real contact.
 */
export function parseSiteLead(raw: unknown): SiteLeadPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.phone !== "string" || p.phone.length > SITE_LEAD_LIMITS.phone || !isValidKzPhone(p.phone)) {
    return null;
  }
  return {
    name: capped(p.name, SITE_LEAD_LIMITS.name).trim(),
    phone: p.phone,
    source: capped(p.source, SITE_LEAD_LIMITS.source) || "site",
    page: capped(p.page, SITE_LEAD_LIMITS.page),
    ref: capped(p.ref, SITE_LEAD_LIMITS.ref),
    utm: capped(p.utm, SITE_LEAD_LIMITS.utm),
    utmSource: capped(p.utm_source, SITE_LEAD_LIMITS.utmSource),
    utmMedium: capped(p.utm_medium, SITE_LEAD_LIMITS.utmMedium),
    utmCampaign: capped(p.utm_campaign, SITE_LEAD_LIMITS.utmCampaign),
    utmContent: capped(p.utm_content, SITE_LEAD_LIMITS.utmContent),
    utmTerm: capped(p.utm_term, SITE_LEAD_LIMITS.utmTerm),
    ts: ISO_TS.test(capped(p.ts, SITE_LEAD_LIMITS.ts)) ? (p.ts as string) : "",
  };
}

/**
 * Human-readable UTM summary for Telegram / CRM comments. Prefers the raw query
 * string the site sends; if it only sends discrete keys, composes one from them
 * so managers never lose the attribution even when `utm` is empty.
 */
export function formatUtm(p: SiteLeadPayload): string {
  if (p.utm) return p.utm;
  return [
    p.utmSource && `utm_source=${p.utmSource}`,
    p.utmMedium && `utm_medium=${p.utmMedium}`,
    p.utmCampaign && `utm_campaign=${p.utmCampaign}`,
    p.utmContent && `utm_content=${p.utmContent}`,
    p.utmTerm && `utm_term=${p.utmTerm}`,
  ]
    .filter(Boolean)
    .join("&");
}
