import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { validateLead, type LeadPayload } from "../src/core/lead";
import { parseSiteLead, type SiteLeadPayload } from "../src/core/siteLead";
import { computePayment } from "../src/core/calc";
import { bitrixCall, buildLeadFields, buildSiteLeadFields } from "../api/_shared/bitrix";
import { rateLimit } from "../api/_shared/ratelimit";
import { verifyToken, bearer } from "../api/_shared/adminAuth";
import { appendLead, appendSiteLead, readLeads } from "./leadsStore";
import { notifyTelegram, notifySiteLead } from "./notify";

const PORT = Number(process.env.PORT ?? 3000);
// In a container the process is network-isolated, so HOST=0.0.0.0 lets nginx reach
// it over the compose network. Loopback default keeps a bare-metal run private.
const HOST = process.env.HOST ?? "127.0.0.1";

function clientIp(c: Context): string {
  // Behind nginx the rightmost X-Forwarded-For entry is the proxy-appended real
  // client IP; a client-supplied (spoofed) value sits to its left.
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    return parts[parts.length - 1]?.trim() || "unknown";
  }
  return "unknown";
}

/** Mirrors a saved lead to Telegram + Bitrix (best-effort, off the response path). */
async function mirrorLead(lead: LeadPayload): Promise<void> {
  const tasks: Promise<unknown>[] = [notifyTelegram(lead)];
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (webhook && !webhook.includes("<")) {
    tasks.push(
      bitrixCall<number>(
        "crm.lead.add",
        {
          fields: buildLeadFields(lead, process.env.BITRIX_SOURCE_ID ?? "WEB"),
          params: { REGISTER_SONET_EVENT: "Y" },
        },
        { webhookUrl: webhook },
      ),
    );
  }
  for (const r of await Promise.allSettled(tasks)) {
    if (r.status === "rejected") console.error("[leads-api] mirror failed (lead is still saved)", r.reason);
  }
}

/** Same best-effort mirror for atamura.group site-form leads. */
async function mirrorSiteLead(lead: SiteLeadPayload): Promise<void> {
  const tasks: Promise<unknown>[] = [notifySiteLead(lead)];
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (webhook && !webhook.includes("<")) {
    tasks.push(
      bitrixCall<number>(
        "crm.lead.add",
        {
          fields: buildSiteLeadFields(lead, process.env.BITRIX_SOURCE_ID ?? "WEB"),
          params: { REGISTER_SONET_EVENT: "Y" },
        },
        { webhookUrl: webhook },
      ),
    );
  }
  for (const r of await Promise.allSettled(tasks)) {
    if (r.status === "rejected") console.error("[site-lead] mirror failed (lead is still saved)", r.reason);
  }
}

const api = new Hono();
api.use(
  "*",
  cors({
    // ALLOWED_ORIGIN is a comma-separated allowlist (the site's own origins + calculator).
    // Read lazily per request so a restart-only env change is enough and tests can vary it.
    origin: (origin) => {
      const allowed = (process.env.ALLOWED_ORIGIN ?? "*")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowed.includes("*")) return "*";
      return allowed.includes(origin) ? origin : undefined;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);
// Cap request bodies so an oversized POST can't balloon memory before validation.
api.use("*", bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ ok: false, error: "too_large" }, 413) }));

api.post("/lead", async (c) => {
  if (!rateLimit(`lead:${clientIp(c)}`)) return c.json({ ok: false, error: "rate_limited" }, 429);
  const body = (await c.req.json().catch(() => null)) as Partial<LeadPayload> | null;
  if (!body || typeof body !== "object") return c.json({ ok: false, error: "invalid_body" }, 400);

  const validation = validateLead(body);
  if (!validation.ok) return c.json({ ok: false, error: "validation", fields: validation.errors }, 400);

  const lead = body as LeadPayload;
  // Never trust the client's monthlyPayment — recompute from validated inputs so a
  // tampered POST can't write a misleading figure into the store / CRM / Telegram.
  lead.monthlyPayment = computePayment({
    cost: lead.cost,
    downPayment: lead.downPayment,
    annualRatePercent: lead.annualRatePercent,
    termMonths: lead.termMonths,
  }).monthlyPayment;

  // 1) Always persist the lead — the site captures it regardless of any CRM.
  try {
    await appendLead(lead, new Date().toISOString());
  } catch (err) {
    console.error("[lead] file append failed", err);
    return c.json({ ok: false, error: "store_failed" }, 500);
  }

  // 2) Mirror to Telegram + Bitrix off the response path so a slow/unreachable
  //    third party can never stall the user's submit (lead is already saved).
  void mirrorLead(lead);

  return c.json({ ok: true });
});

/** Masked one-line trace of a rejected submission — the client ignores responses,
 *  so the server log is the only place a dropped contact can be recovered from. */
function siteLeadTrace(body: Record<string, unknown> | null, c: Context): string {
  const digits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  return JSON.stringify({
    phone: digits ? `***${digits.slice(-4)}` : "none",
    source: typeof body?.source === "string" ? body.source.slice(0, 64) : "",
    page: typeof body?.page === "string" ? body.page.slice(0, 128) : "",
    ip: clientIp(c),
  });
}

// Lead forms of the static atamura.group site (app.js LEAD_WEBHOOK) post here.
api.post("/site-lead", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  // Per-IP limit is generous (KZ carriers CGNAT many visitors behind one IP);
  // the sitewide ceiling keeps a distributed bot run from flooding CRM/Telegram.
  if (!rateLimit(`site-lead:${clientIp(c)}`, 20, 60_000) || !rateLimit("site-lead:global", 120, 60_000)) {
    console.warn("[site-lead] rate-limited submission dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "rate_limited" }, 429);
  }
  if (!body || typeof body !== "object") {
    console.warn("[site-lead] invalid body dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  // Honeypot: the visible forms have no "company" field — only bots fill it.
  // Answer ok so the bot moves on, store nothing.
  if (typeof body.company === "string" && body.company.trim()) {
    console.warn("[site-lead] honeypot tripped, dropping submission", siteLeadTrace(body, c));
    return c.json({ ok: true });
  }

  const lead = parseSiteLead(body);
  if (!lead) {
    console.warn("[site-lead] validation-rejected submission dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "validation", fields: ["phone"] }, 400);
  }

  try {
    await appendSiteLead(lead, new Date().toISOString());
  } catch (err) {
    console.error("[site-lead] file append failed", err);
    return c.json({ ok: false, error: "store_failed" }, 500);
  }

  void mirrorSiteLead(lead);
  return c.json({ ok: true });
});

// Admin lead viewer — token-gated. Disabled (503) when admin secrets are unset so the
// capture endpoints above can run without them.
api.get("/leads", async (c) => {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, error: "leads_viewer_disabled" }, 503);
  const token = bearer(c.req.header("authorization"));
  if (!token || !verifyToken(token, secret)) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  return c.json({ ok: true, leads: await readLeads(200) });
});

export const app = new Hono();

// Surface any unhandled handler error instead of leaking a bare 500.
app.onError((err, c) => {
  console.error("[leads-api] unhandled error", err);
  return c.json({ ok: false, error: "internal" }, 500);
});

app.route("/api", api);
app.get("/healthz", (c) => c.text("ok"));

/* v8 ignore start -- operational boot/shutdown code, exercised in production not unit tests */
/** Warns on weak config; never hard-exits so lead capture stays available. */
function assertConfig(): void {
  if ((process.env.ALLOWED_ORIGIN ?? "*") === "*") {
    console.warn("[leads-api] WARNING: ALLOWED_ORIGIN is '*' (open CORS) — set it to the site's origins");
  }
  if (!process.env.ADMIN_TOKEN_SECRET) {
    console.warn("[leads-api] ADMIN_TOKEN_SECRET unset — /api/leads viewer disabled (capture endpoints unaffected)");
  }
}

// Bootstrap only when run as the server (skipped when imported by tests).
if (!process.env.VITEST) {
  assertConfig();
  const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    console.log(`[leads-api] listening on ${HOST}:${info.port}`);
  });
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      console.log(`[leads-api] ${sig} received, draining connections…`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
}
/* v8 ignore stop */
