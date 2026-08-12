import { describe, it, expect } from "vitest";
import { normalizeKzPhone, isValidKzPhone } from "./phone";

describe("normalizeKzPhone", () => {
  it("converts a leading 8 to country code 7", () => {
    expect(normalizeKzPhone("87071234567")).toBe("77071234567");
  });

  it("strips formatting from a +7 number", () => {
    expect(normalizeKzPhone("+7 707 123 45 67")).toBe("77071234567");
  });

  it("prefixes country code 7 to a 10-digit mobile", () => {
    expect(normalizeKzPhone("7071234567")).toBe("77071234567");
  });

  it("keeps an already-normalized number", () => {
    expect(normalizeKzPhone("77071234567")).toBe("77071234567");
  });

  it("returns null for too-short input", () => {
    expect(normalizeKzPhone("123")).toBeNull();
  });

  it("returns null for too-long input", () => {
    expect(normalizeKzPhone("770712345678901")).toBeNull();
  });
});

describe("isValidKzPhone", () => {
  it("accepts a normalizable number", () => {
    expect(isValidKzPhone("8 (707) 123-45-67")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidKzPhone("hello")).toBe(false);
  });
});
