import { describe, it, expect } from "vitest";
import { formatTenge, parseTenge, parseDecimalInput, pctToAmount, amountToPct, clamp } from "./money";

const NBSP = " ";

describe("formatTenge", () => {
  it("groups thousands with a non-breaking space and appends ₸", () => {
    expect(formatTenge(12_500_000)).toBe(`12${NBSP}500${NBSP}000${NBSP}₸`);
  });

  it("formats small amounts without grouping", () => {
    expect(formatTenge(500)).toBe(`500${NBSP}₸`);
  });

  it("formats zero", () => {
    expect(formatTenge(0)).toBe(`0${NBSP}₸`);
  });

  it("renders 0 for non-finite values instead of 'NaN ₸'/'Infinity ₸'", () => {
    expect(formatTenge(NaN)).toBe(`0${NBSP}₸`);
    expect(formatTenge(Infinity)).toBe(`0${NBSP}₸`);
  });

  it("does not produce a negative-zero string", () => {
    expect(formatTenge(-0)).toBe(`0${NBSP}₸`);
  });
});

describe("parseDecimalInput", () => {
  it("treats a comma as a decimal separator (ru-KZ locale)", () => {
    expect(parseDecimalInput("18,5")).toBe(18.5);
  });

  it("parses a dot decimal", () => {
    expect(parseDecimalInput("7.25")).toBe(7.25);
  });

  it("collapses extra separators instead of returning NaN", () => {
    expect(parseDecimalInput("1.2.3")).toBe(1.23);
  });

  it("drops a leading sign and non-digits", () => {
    expect(parseDecimalInput("-5")).toBe(5);
    expect(parseDecimalInput("60%")).toBe(60);
  });

  it("returns 0 for empty or non-numeric input", () => {
    expect(parseDecimalInput("")).toBe(0);
    expect(parseDecimalInput(".")).toBe(0);
    expect(parseDecimalInput("abc")).toBe(0);
  });
});

describe("parseTenge", () => {
  it("round-trips a formatted value", () => {
    expect(parseTenge(`12${NBSP}500${NBSP}000${NBSP}₸`)).toBe(12_500_000);
  });

  it("parses a value typed with regular spaces and a currency sign", () => {
    expect(parseTenge("12 500 000 ₸")).toBe(12_500_000);
  });

  it("returns 0 for empty or non-numeric input", () => {
    expect(parseTenge("")).toBe(0);
    expect(parseTenge("abc")).toBe(0);
  });
});

describe("pctToAmount / amountToPct", () => {
  it("converts percent of cost to an integer amount", () => {
    expect(pctToAmount(10_000_000, 20)).toBe(2_000_000);
  });

  it("converts an amount back to percent", () => {
    expect(amountToPct(10_000_000, 2_000_000)).toBe(20);
  });

  it("guards against a zero cost when computing percent", () => {
    expect(amountToPct(0, 0)).toBe(0);
  });
});

describe("clamp", () => {
  it("bounds a value to [min, max]", () => {
    expect(clamp(120, 0, 90)).toBe(90);
    expect(clamp(-5, 0, 90)).toBe(0);
    expect(clamp(45, 0, 90)).toBe(45);
  });
});
