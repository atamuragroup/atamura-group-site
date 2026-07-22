import type { LeadPayload } from "../../src/core/lead";
import { normalizeKzPhone } from "../../src/core/phone";
import { formatTenge } from "../../src/core/money";
import { formatTerm } from "../../src/lib/format";
import { findProject } from "../../src/data/projects";
import { formatUtm, type SiteLeadPayload } from "../../src/core/siteLead";

/** Lead CRM field for the source ЖК (string, RU name — same format other lead
 *  channels use). NOTE: UF_CRM_1758630528 "Проект - встреча" exists only on DEALS
 *  and is silently ignored by crm.lead.add — verified against the live portal. */
export const ZHK_FIELD = "UF_CRM_COMPLEX";

export class BitrixError extends Error {
  constructor(
    public code: string,
    public description: string,
    public method: string,
  ) {
    super(`Bitrix ${method} failed: ${code} ${description}`);
    this.name = "BitrixError";
  }
}

const RETRYABLE_CODES = new Set([
  "QUERY_LIMIT_EXCEEDED",
  "OPERATION_TIME_LIMIT",
  "INTERNAL_SERVER_ERROR",
]);

export interface BitrixCallOptions {
  webhookUrl: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  backoffMs?: (attempt: number) => number;
  /** Per-attempt timeout; a hung portal aborts (and retries) instead of blocking forever. */
  attemptTimeoutMs?: number;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Calls a Bitrix24 REST method via inbound webhook with retry/backoff on rate limits and 5xx. */
export async function bitrixCall<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  opts: BitrixCallOptions,
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.webhookUrl.replace(/\/+$/, "");
  const url = `${base}/${method}.json`;
  const maxRetries = opts.maxRetries ?? 3;
  const backoff = opts.backoffMs ?? ((a) => Math.min(2000, 250 * 2 ** a));
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? 8000;

  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });
    } catch (err) {
      if (attempt < maxRetries) {
        await delay(backoff(attempt++));
        continue;
      }
      throw new BitrixError("NETWORK_ERROR", String(err), method);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await delay(backoff(attempt++));
      continue;
    }

    const data = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      if (RETRYABLE_CODES.has(data.error) && attempt < maxRetries) {
        await delay(backoff(attempt++));
        continue;
      }
      throw new BitrixError(data.error, data.error_description ?? "", method);
    }
    if (!res.ok) {
      throw new BitrixError(`HTTP_${res.status}`, "", method);
    }
    return data.result as T;
  }
}

/** Human-readable расчёт written into the lead's COMMENTS. */
export function buildLeadComment(p: LeadPayload): string {
  const overpayment = Math.max(0, p.monthlyPayment * p.termMonths - (p.cost - p.downPayment));
  return [
    "Заявка с калькулятора платежа",
    `Стоимость квартиры: ${formatTenge(p.cost)}`,
    `Первоначальный взнос: ${formatTenge(p.downPayment)}`,
    `Программа: ${p.programName}`,
    p.annualRatePercent > 0
      ? `Ставка: ${p.annualRatePercent}% годовых · ${formatTerm(p.termMonths)}`
      : `Рассрочка · ${formatTerm(p.termMonths)}`,
    `Ежемесячный платёж: ${formatTenge(p.monthlyPayment)}`,
    p.annualRatePercent > 0 ? `Ориентировочная переплата: ${formatTenge(overpayment)}` : "Без переплаты",
    `Источник: ${p.source}`,
  ].join("\n");
}

/** Builds the FIELDS object for crm.lead.add from a validated lead. */
export function buildLeadFields(p: LeadPayload, sourceId: string): Record<string, unknown> {
  const phone = normalizeKzPhone(p.phone) ?? p.phone;
  const project = findProject(p.source);
  const fields: Record<string, unknown> = {
    TITLE: `Калькулятор: ${p.programName}, ${formatTenge(p.cost)}`,
    NAME: p.name.trim(),
    PHONE: [{ VALUE: phone, VALUE_TYPE: "WORK" }],
    SOURCE_ID: sourceId,
    COMMENTS: buildLeadComment(p),
    OPPORTUNITY: p.cost,
    CURRENCY_ID: "KZT",
  };
  if (project) {
    fields[ZHK_FIELD] = project.name;
  }
  return fields;
}

/** Builds the FIELDS object for crm.lead.add from a validated atamura.group site-form lead. */
export function buildSiteLeadFields(p: SiteLeadPayload, sourceId: string): Record<string, unknown> {
  const phone = normalizeKzPhone(p.phone) ?? p.phone;
  // ЖК-page forms tag the lead as "zk-<slug>" — strip the prefix to reuse the project map.
  const project = findProject(p.source.replace(/^zk-/, ""));
  const utm = formatUtm(p);
  const comments = [
    "Заявка с формы сайта atamura.group",
    p.page && `Страница: ${p.page}`,
    p.ref && `Реферер: ${p.ref}`,
    utm && `UTM: ${utm}`,
    p.ts && `Отправлено: ${p.ts}`,
  ]
    .filter(Boolean)
    .join("\n");
  const fields: Record<string, unknown> = {
    TITLE: `Сайт atamura.group: ${p.source}`,
    NAME: p.name,
    PHONE: [{ VALUE: phone, VALUE_TYPE: "WORK" }],
    SOURCE_ID: sourceId,
    COMMENTS: comments,
  };
  // Bitrix's native UTM lead fields — populate whichever the site provided so the
  // CRM's own source/campaign analytics work, not just the comment text.
  if (p.utmSource) fields.UTM_SOURCE = p.utmSource;
  if (p.utmMedium) fields.UTM_MEDIUM = p.utmMedium;
  if (p.utmCampaign) fields.UTM_CAMPAIGN = p.utmCampaign;
  if (p.utmContent) fields.UTM_CONTENT = p.utmContent;
  if (p.utmTerm) fields.UTM_TERM = p.utmTerm;
  if (project) {
    fields[ZHK_FIELD] = project.name;
  }
  return fields;
}
