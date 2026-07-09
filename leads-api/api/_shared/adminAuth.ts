import { createHmac, timingSafeEqual } from "node:crypto";

/** Issues a short-lived HMAC token `exp.signature` for the admin panel. */
export function issueToken(secret: string, ttlMs = 3_600_000, now: number = Date.now()): string {
  const exp = now + ttlMs;
  const sig = createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

/** Verifies a token's signature and expiry in constant time. */
export function verifyToken(token: string, secret: string, now: number = Date.now()): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || now > exp) return false;
  const expected = createHmac("sha256", secret).update(expStr).digest("hex");
  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** Constant-time string comparison (avoids password/secret timing oracles). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Extracts a bearer token from the Authorization header. */
export function bearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1]! : null;
}
