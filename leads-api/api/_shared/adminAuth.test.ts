// @vitest-environment node
import { describe, it, expect } from "vitest";
import { issueToken, verifyToken, bearer } from "./adminAuth";

describe("admin token", () => {
  it("verifies a freshly issued token", () => {
    const t = issueToken("secret", 1000, 1000);
    expect(verifyToken(t, "secret", 1500)).toBe(true);
  });

  it("rejects an expired token", () => {
    const t = issueToken("secret", 1000, 1000);
    expect(verifyToken(t, "secret", 5000)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const t = issueToken("secret", 1000, 1000);
    expect(verifyToken(t, "other", 1500)).toBe(false);
  });

  it("rejects a tampered token", () => {
    expect(verifyToken("9999999999999.deadbeef", "secret")).toBe(false);
    expect(verifyToken("garbage", "secret")).toBe(false);
  });
});

describe("bearer", () => {
  it("extracts the token", () => {
    expect(bearer("Bearer abc.def")).toBe("abc.def");
    expect(bearer("bearer xyz")).toBe("xyz");
  });
  it("returns null when absent", () => {
    expect(bearer(undefined)).toBeNull();
    expect(bearer("Basic zzz")).toBeNull();
  });
});
