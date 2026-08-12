// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLead, appendSiteLead, readLeads } from "./leadsStore";
import type { LeadPayload } from "../src/core/lead";
import type { SiteLeadPayload } from "../src/core/siteLead";

const base: LeadPayload = {
  name: "Тест",
  phone: "87011234567",
  cost: 25_000_000,
  downPayment: 5_000_000,
  programId: "7-20-25",
  programName: "7-20-25",
  annualRatePercent: 7,
  termMonths: 300,
  monthlyPayment: 141_356,
  source: "site",
  consent: true,
};

const FILE = join(tmpdir(), `tm-leads-${process.pid}.jsonl`);

describe("leadsStore", () => {
  beforeEach(async () => {
    process.env.LEADS_FILE = FILE;
    await fs.rm(FILE, { force: true });
  });

  it("appends and reads leads newest-first with a normalized phone", async () => {
    await appendLead({ ...base, name: "A", phone: "87011111111" }, "2026-06-05T10:00:00.000Z");
    await appendLead({ ...base, name: "B", phone: "+7 702 222 22 22" }, "2026-06-05T11:00:00.000Z");
    const leads = await readLeads();
    expect(leads).toHaveLength(2);
    expect(leads[0]?.name).toBe("B");
    expect(leads[0]?.phone).toBe("77022222222");
    expect(leads[1]?.name).toBe("A");
  });

  it("returns an empty array when the file does not exist", async () => {
    process.env.LEADS_FILE = join(tmpdir(), `tm-leads-missing-${process.pid}.jsonl`);
    expect(await readLeads()).toEqual([]);
  });
});

describe("siteLeadsStore", () => {
  const SITE_FILE = join(tmpdir(), `tm-site-leads-${process.pid}.jsonl`);
  const siteLead: SiteLeadPayload = {
    name: "Айбек",
    phone: "8 707 123 45 67",
    source: "foot-cta",
    page: "/contacts.html",
    ref: "https://google.com/",
    utm: "?utm_source=ig",
    utmSource: "ig",
    utmMedium: "cpc",
    utmCampaign: "june",
    utmContent: "banner-a",
    utmTerm: "ипотека",
    ts: "2026-06-12T09:59:58.000Z",
  };

  beforeEach(async () => {
    process.env.SITE_LEADS_FILE = SITE_FILE;
    await fs.rm(SITE_FILE, { force: true });
  });

  it("appends a site lead to its own file with a normalized phone", async () => {
    await appendSiteLead(siteLead, "2026-06-12T10:00:00.000Z");
    const raw = await fs.readFile(SITE_FILE, "utf8");
    expect(JSON.parse(raw.trim())).toEqual({
      at: "2026-06-12T10:00:00.000Z",
      name: "Айбек",
      phone: "77071234567",
      source: "foot-cta",
      page: "/contacts.html",
      ref: "https://google.com/",
      utm: "?utm_source=ig",
      utmSource: "ig",
      utmMedium: "cpc",
      utmCampaign: "june",
      utmContent: "banner-a",
      utmTerm: "ипотека",
      ts: "2026-06-12T09:59:58.000Z",
    });
  });
});
