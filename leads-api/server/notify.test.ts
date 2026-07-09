// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyTelegram, notifySiteLead } from "./notify";
import type { LeadPayload } from "../src/core/lead";
import type { SiteLeadPayload } from "../src/core/siteLead";

const lead: LeadPayload = {
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

describe("notifyTelegram", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is a no-op when not configured", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await notifyTelegram(lead);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts to the Telegram API when configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    process.env.TELEGRAM_CHAT_ID = "123";
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await notifyTelegram(lead);
    expect(f).toHaveBeenCalledWith(
      "https://api.telegram.org/bottok/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("notifySiteLead", () => {
  const siteLead: SiteLeadPayload = {
    name: "Айбек",
    phone: "87011234567",
    source: "zk-aura",
    page: "/zk/aura.html",
    ref: "https://google.com/",
    utm: "?utm_source=ig",
    utmSource: "ig",
    utmMedium: "",
    utmCampaign: "",
    utmContent: "",
    utmTerm: "",
    ts: "2026-06-12T10:00:00.000Z",
  };

  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is a no-op when not configured", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await notifySiteLead(siteLead);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts a site-lead message with normalized phone, source and page", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    process.env.TELEGRAM_CHAT_ID = "123";
    const f = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await notifySiteLead(siteLead);
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body)) as { text: string };
    expect(body.text).toContain("+77011234567");
    expect(body.text).toContain("zk-aura");
    expect(body.text).toContain("/zk/aura.html");
  });
});
