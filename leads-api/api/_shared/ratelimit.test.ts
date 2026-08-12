// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, _resetRateLimit } from "./ratelimit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimit());

  it("allows up to the limit then blocks within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000, 1000)).toBe(true);
    }
    expect(rateLimit("k", 5, 60_000, 1000)).toBe(false);
  });

  it("resets after the window elapses", () => {
    expect(rateLimit("k", 1, 1000, 0)).toBe(true);
    expect(rateLimit("k", 1, 1000, 500)).toBe(false);
    expect(rateLimit("k", 1, 1000, 2000)).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("a", 1, 1000, 0)).toBe(true);
    expect(rateLimit("b", 1, 1000, 0)).toBe(true);
    expect(rateLimit("a", 1, 1000, 0)).toBe(false);
  });
});
