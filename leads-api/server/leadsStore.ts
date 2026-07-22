import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { LeadPayload } from "../src/core/lead";
import type { SiteLeadPayload } from "../src/core/siteLead";
import { normalizeKzPhone } from "../src/core/phone";

export interface LeadRecord {
  at: string;
  name: string;
  phone: string;
  cost: number;
  downPayment: number;
  programId: string;
  programName: string;
  annualRatePercent: number;
  termMonths: number;
  monthlyPayment: number;
  source: string;
}

export interface SiteLeadRecord {
  at: string;
  name: string;
  phone: string;
  source: string;
  page: string;
  ref: string;
  utm: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  ts: string;
}

const leadsFile = (): string => process.env.LEADS_FILE ?? "./data/leads.jsonl";
const siteLeadsFile = (): string => process.env.SITE_LEADS_FILE ?? "./data/site-leads.jsonl";

// Open + append + fsync so an acknowledged lead survives a power loss / crash,
// not just a clean process exit.
async function appendRecord(file: string, record: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  const fh = await fs.open(file, "a");
  try {
    await fh.appendFile(JSON.stringify(record) + "\n", "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** Appends a captured calculator lead to a JSONL file so nothing is lost without a CRM. */
export async function appendLead(lead: LeadPayload, at: string): Promise<void> {
  const record: LeadRecord = {
    at,
    name: lead.name.trim(),
    phone: normalizeKzPhone(lead.phone) ?? lead.phone,
    cost: lead.cost,
    downPayment: lead.downPayment,
    programId: lead.programId,
    programName: lead.programName,
    annualRatePercent: lead.annualRatePercent,
    termMonths: lead.termMonths,
    monthlyPayment: lead.monthlyPayment,
    source: lead.source,
  };
  await appendRecord(leadsFile(), record);
}

/** Appends an atamura.group site-form lead to its own JSONL file. */
export async function appendSiteLead(lead: SiteLeadPayload, at: string): Promise<void> {
  const record: SiteLeadRecord = {
    at,
    name: lead.name,
    phone: normalizeKzPhone(lead.phone) ?? lead.phone,
    source: lead.source,
    page: lead.page,
    ref: lead.ref,
    utm: lead.utm,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent,
    utmTerm: lead.utmTerm,
    ts: lead.ts,
  };
  await appendRecord(siteLeadsFile(), record);
}

/** Reads up to `limit` most-recent leads (newest first). Missing file → []. */
export async function readLeads(limit = 200): Promise<LeadRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(leadsFile(), "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const out: LeadRecord[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as LeadRecord);
    } catch {
      /* skip a corrupt line */
    }
  }
  return out.reverse().slice(0, limit);
}
