import { describe, it, expect } from "vitest";
import { validateLead, type LeadPayload } from "./lead";

const base: LeadPayload = {
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

describe("validateLead", () => {
  it("accepts a complete valid lead", () => {
    expect(validateLead(base).ok).toBe(true);
  });

  it("requires a non-empty name", () => {
    expect(validateLead({ ...base, name: "   " }).errors).toContain("name");
  });

  it("requires a valid KZ phone", () => {
    expect(validateLead({ ...base, phone: "123" }).errors).toContain("phone");
  });

  it("requires consent to be true", () => {
    expect(validateLead({ ...base, consent: false }).errors).toContain("consent");
  });

  it("requires a positive cost", () => {
    expect(validateLead({ ...base, cost: 0 }).errors).toContain("cost");
  });

  it("does not throw on a non-string name (attacker JSON) and flags it", () => {
    // @ts-expect-error — runtime body is untrusted JSON
    expect(() => validateLead({ ...base, name: 123 })).not.toThrow();
    // @ts-expect-error
    expect(validateLead({ ...base, name: 123 }).errors).toContain("name");
  });

  it("does not throw on a non-string phone and flags it", () => {
    // @ts-expect-error
    expect(validateLead({ ...base, phone: { x: 1 } }).errors).toContain("phone");
  });

  it("rejects a non-finite cost", () => {
    expect(validateLead({ ...base, cost: Number.NaN }).errors).toContain("cost");
  });

  it("rejects an oversized name", () => {
    expect(validateLead({ ...base, name: "x".repeat(300) }).errors).toContain("name");
  });

  it("rejects a down payment greater than the cost", () => {
    expect(validateLead({ ...base, downPayment: base.cost + 1 }).errors).toContain("downPayment");
  });

  it("rejects a non-integer or out-of-range term", () => {
    expect(validateLead({ ...base, termMonths: 0 }).errors).toContain("termMonths");
    expect(validateLead({ ...base, termMonths: 12.5 }).errors).toContain("termMonths");
    expect(validateLead({ ...base, termMonths: 9999 }).errors).toContain("termMonths");
  });

  it("rejects an out-of-range rate", () => {
    expect(validateLead({ ...base, annualRatePercent: -1 }).errors).toContain("annualRatePercent");
    expect(validateLead({ ...base, annualRatePercent: 200 }).errors).toContain("annualRatePercent");
  });

  it("rejects oversized / empty program and source fields (CRM poisoning guard)", () => {
    expect(validateLead({ ...base, programName: "x".repeat(300) }).errors).toContain("programName");
    expect(validateLead({ ...base, source: "" }).errors).toContain("source");
    // @ts-expect-error — untrusted JSON may send a non-string
    expect(validateLead({ ...base, programId: { evil: 1 } }).errors).toContain("programId");
  });
});
