// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { bitrixCall, buildLeadFields, buildSiteLeadFields, BitrixError, ZHK_FIELD } from "./bitrix";
import type { LeadPayload } from "../../src/core/lead";
import type { SiteLeadPayload } from "../../src/core/siteLead";

const lead: LeadPayload = {
  name: "Айбек",
  phone: "87071234567",
  cost: 25_000_000,
  downPayment: 5_000_000,
  programId: "rassrochka",
  programName: "Рассрочка застройщика",
  annualRatePercent: 0,
  termMonths: 24,
  monthlyPayment: 833_333,
  source: "atmosfera",
  consent: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("buildLeadFields", () => {
  it("maps name, normalized phone, source and the ЖК complex field", () => {
    const f = buildLeadFields(lead, "WEB");
    expect(f.NAME).toBe("Айбек");
    expect(f.PHONE).toEqual([{ VALUE: "77071234567", VALUE_TYPE: "WORK" }]);
    expect(f.SOURCE_ID).toBe("WEB");
    expect(f[ZHK_FIELD]).toBe("Атмосфера");
    expect(String(f.COMMENTS)).toContain("Ежемесячный платёж");
  });

  it("omits the project field for a non-ЖК source", () => {
    const f = buildLeadFields({ ...lead, source: "calculator" }, "WEB");
    expect(f[ZHK_FIELD]).toBeUndefined();
  });
});

describe("buildSiteLeadFields", () => {
  const siteLead: SiteLeadPayload = {
    name: "Айбек",
    phone: "87071234567",
    source: "zk-aura",
    page: "/zk/aura.html",
    ref: "https://google.com/",
    utm: "?utm_source=ig&utm_campaign=june",
    utmSource: "ig",
    utmMedium: "cpc",
    utmCampaign: "june",
    utmContent: "banner-a",
    utmTerm: "ипотека",
    ts: "2026-06-12T10:00:00.000Z",
  };

  it("maps name, normalized phone, source and resolves the ЖК from a zk-prefixed source", () => {
    const f = buildSiteLeadFields(siteLead, "WEB");
    expect(f.TITLE).toBe("Сайт atamura.group: zk-aura");
    expect(f.NAME).toBe("Айбек");
    expect(f.PHONE).toEqual([{ VALUE: "77071234567", VALUE_TYPE: "WORK" }]);
    expect(f.SOURCE_ID).toBe("WEB");
    expect(f[ZHK_FIELD]).toBe("Аура");
    const comments = String(f.COMMENTS);
    expect(comments).toContain("/zk/aura.html");
    expect(comments).toContain("https://google.com/");
    expect(comments).toContain("utm_campaign=june");
  });

  it("maps the discrete UTM params to Bitrix's native UTM_* lead fields", () => {
    const f = buildSiteLeadFields(siteLead, "WEB");
    expect(f.UTM_SOURCE).toBe("ig");
    expect(f.UTM_MEDIUM).toBe("cpc");
    expect(f.UTM_CAMPAIGN).toBe("june");
    expect(f.UTM_CONTENT).toBe("banner-a");
    expect(f.UTM_TERM).toBe("ипотека");
  });

  it("omits absent UTM_* fields instead of writing empty strings", () => {
    const f = buildSiteLeadFields(
      { ...siteLead, utmSource: "ig", utmMedium: "", utmCampaign: "", utmContent: "", utmTerm: "" },
      "WEB",
    );
    expect(f.UTM_SOURCE).toBe("ig");
    expect(f).not.toHaveProperty("UTM_MEDIUM");
    expect(f).not.toHaveProperty("UTM_CAMPAIGN");
  });

  it("falls back to a composed UTM comment when only discrete keys are sent", () => {
    const f = buildSiteLeadFields(
      { ...siteLead, utm: "", utmMedium: "", utmContent: "", utmTerm: "" },
      "WEB",
    );
    const comments = String(f.COMMENTS);
    expect(comments).toContain("UTM: utm_source=ig&utm_campaign=june");
  });

  it("omits the project field for the footer form and skips empty context lines", () => {
    const f = buildSiteLeadFields(
      {
        ...siteLead,
        source: "foot-cta",
        ref: "",
        utm: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmContent: "",
        utmTerm: "",
      },
      "WEB",
    );
    expect(f[ZHK_FIELD]).toBeUndefined();
    const comments = String(f.COMMENTS);
    expect(comments).not.toContain("Реферер");
    expect(comments).not.toContain("UTM");
  });
});

describe("bitrixCall", () => {
  const opts = { webhookUrl: "https://amanat.bitrix24.kz/rest/10/tok/", backoffMs: () => 0 };

  it("returns the result on success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: 42 }));
    const r = await bitrixCall<number>("crm.lead.add", { fields: {} }, { ...opts, fetchImpl });
    expect(r).toBe(42);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("builds the URL from webhook base + method.json", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: 1 }));
    await bitrixCall("crm.lead.add", {}, { ...opts, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://amanat.bitrix24.kz/rest/10/tok/crm.lead.add.json",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("retries on HTTP 503 then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ result: 7 }));
    const r = await bitrixCall<number>("crm.lead.add", {}, { ...opts, fetchImpl });
    expect(r).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws BitrixError on a non-retryable error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "INVALID_CREDENTIALS", error_description: "bad token" }),
    );
    await expect(
      bitrixCall("crm.lead.add", {}, { ...opts, fetchImpl, maxRetries: 1 }),
    ).rejects.toBeInstanceOf(BitrixError);
  });
});
