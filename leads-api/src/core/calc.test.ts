import { describe, it, expect } from "vitest";
import { computePayment, computeOtbasy, validateInput } from "./calc";
import type { CalcInput } from "./calc.types";

describe("computePayment — annuity (rate > 0)", () => {
  it("matches a known reference: 100 000 ₸ @ 12%/yr, 12 mo → 8 885 ₸/mo", () => {
    // Excel =PMT(0.01,12,-100000) = 8884.88 → rounds to 8885
    const r = computePayment({
      cost: 100_000,
      downPayment: 0,
      annualRatePercent: 12,
      termMonths: 12,
    });
    expect(r.monthlyPayment).toBe(8885);
    expect(r.loanAmount).toBe(100_000);
    expect(r.isZeroRate).toBe(false);
  });

  it("subtracts the down payment from the loan principal", () => {
    const r = computePayment({
      cost: 10_000_000,
      downPayment: 2_000_000,
      annualRatePercent: 18,
      termMonths: 120,
    });
    expect(r.loanAmount).toBe(8_000_000);
  });

  it("keeps the three outputs mutually consistent (no float drift)", () => {
    const inputs: CalcInput[] = [
      { cost: 25_000_000, downPayment: 5_000_000, annualRatePercent: 16.5, termMonths: 180 },
      { cost: 9_999_999, downPayment: 1_234_567, annualRatePercent: 7, termMonths: 240 },
      { cost: 42_000_000, downPayment: 0, annualRatePercent: 21, termMonths: 60 },
    ];
    for (const input of inputs) {
      const r = computePayment(input);
      expect(r.loanAmount).toBe(input.cost - input.downPayment);
      expect(r.totalToPay).toBe(r.monthlyPayment * input.termMonths);
      expect(r.overpayment).toBe(r.totalToPay - r.loanAmount);
      expect(Number.isInteger(r.monthlyPayment)).toBe(true);
    }
  });
});

describe("computePayment — zero-rate installment", () => {
  it("splits the principal into equal parts", () => {
    const r = computePayment({
      cost: 12_000_000,
      downPayment: 0,
      annualRatePercent: 0,
      termMonths: 24,
    });
    expect(r.monthlyPayment).toBe(500_000);
    expect(r.overpayment).toBe(0);
    expect(r.totalToPay).toBe(12_000_000);
    expect(r.isZeroRate).toBe(true);
  });

  it("rounds the per-month figure but reports no overpayment for an interest-free plan", () => {
    const r = computePayment({
      cost: 10_000_000,
      downPayment: 1_000_000,
      annualRatePercent: 0,
      termMonths: 7,
    });
    // 9 000 000 / 7 = 1 285 714.28 → 1 285 714 (last instalment absorbs the remainder)
    expect(r.monthlyPayment).toBe(1_285_714);
    expect(r.isZeroRate).toBe(true);
    // Interest-free => exactly the loan amount, zero overpayment regardless of rounding.
    expect(r.overpayment).toBe(0);
    expect(r.totalToPay).toBe(9_000_000);
  });
});

describe("computePayment — edge cases", () => {
  it("handles a single-month term", () => {
    const r = computePayment({
      cost: 1_000_000,
      downPayment: 0,
      annualRatePercent: 12,
      termMonths: 1,
    });
    // one month of interest: 1 000 000 * 1.01 = 1 010 000
    expect(r.monthlyPayment).toBe(1_010_000);
  });

  it("returns zero payment when the loan is fully covered by the down payment", () => {
    const r = computePayment({
      cost: 5_000_000,
      downPayment: 5_000_000,
      annualRatePercent: 18,
      termMonths: 120,
    });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.overpayment).toBe(0);
  });

  it("clamps a down payment greater than the cost to a zero loan", () => {
    const r = computePayment({ cost: 5_000_000, downPayment: 9_000_000, annualRatePercent: 18, termMonths: 120 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.totalToPay).toBe(0);
    expect(r.overpayment).toBe(0);
  });

  it("zero-rate: total equals the loan with no overpayment even for non-divisible terms", () => {
    for (const [loanCost, term] of [[10_000_000, 3], [7_000_000, 6], [9_000_000, 7]] as const) {
      const r = computePayment({ cost: loanCost, downPayment: 0, annualRatePercent: 0, termMonths: term });
      expect(r.isZeroRate).toBe(true);
      expect(r.totalToPay).toBe(loanCost);
      expect(r.overpayment).toBe(0);
      expect(r.monthlyPayment).toBe(Math.round(loanCost / term));
    }
  });

  it("never crashes and returns safe zeros for non-finite inputs", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const r = computePayment({ cost: 10_000_000, downPayment: 0, annualRatePercent: bad, termMonths: 120 });
      expect(Number.isFinite(r.monthlyPayment)).toBe(true);
      const r2 = computePayment({ cost: 10_000_000, downPayment: 0, annualRatePercent: 12, termMonths: bad });
      expect(Number.isFinite(r2.monthlyPayment)).toBe(true);
      expect(r2.overpayment).toBeGreaterThanOrEqual(0);
    }
  });

  it("never reports a negative overpayment, even with a zero/negative term", () => {
    const r = computePayment({ cost: 10_000_000, downPayment: 0, annualRatePercent: 12, termMonths: 0 });
    expect(r.overpayment).toBeGreaterThanOrEqual(0);
    expect(r.monthlyPayment).toBe(0);
  });

  it("treats a negative rate as zero-rate (no negative interest)", () => {
    const r = computePayment({ cost: 10_000_000, downPayment: 0, annualRatePercent: -5, termMonths: 10 });
    expect(r.isZeroRate).toBe(true);
    expect(r.overpayment).toBe(0);
  });
});

describe("validateInput", () => {
  it("accepts a valid input", () => {
    expect(validateInput({ cost: 10_000_000, downPayment: 1_000_000, annualRatePercent: 18, termMonths: 120 }).ok).toBe(true);
  });

  it("rejects a non-positive cost", () => {
    const v = validateInput({ cost: 0, downPayment: 0, annualRatePercent: 18, termMonths: 120 });
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual({ field: "cost", code: "cost_required" });
  });

  it("rejects a down payment above the cost", () => {
    const v = validateInput({ cost: 5_000_000, downPayment: 6_000_000, annualRatePercent: 18, termMonths: 120 });
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual({ field: "downPayment", code: "down_payment_range" });
  });

  it("rejects a term below 1 month", () => {
    const v = validateInput({ cost: 5_000_000, downPayment: 0, annualRatePercent: 18, termMonths: 0 });
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual({ field: "termMonths", code: "term_range" });
  });

  it("rejects a negative rate", () => {
    const v = validateInput({ cost: 5_000_000, downPayment: 0, annualRatePercent: -1, termMonths: 120 });
    expect(v.ok).toBe(false);
    expect(v.errors).toContainEqual({ field: "annualRatePercent", code: "rate_negative" });
  });
});

// Independent reference: the standard annuity (Excel =PMT) the banks use.
// monthly = K·i·(1+i)^n / ((1+i)^n − 1), i = annualPct/12/100.
function referencePmt(loan: number, annualPct: number, n: number): number {
  if (loan <= 0 || n <= 0) return 0;
  if (annualPct <= 0) return loan / n;
  const i = annualPct / 12 / 100;
  const pow = Math.pow(1 + i, n);
  return (loan * i * pow) / (pow - 1);
}

describe("bank parity — annuity matches the reference PMT within tolerance", () => {
  // Real program rates × terms, with and without a down payment, incl. the ТЗ example
  // (Аура: 25 млн, ПВ 20% → loan 20 млн, 15 лет). cost/dp give the loan; rate is nominal.
  const cases: Array<{ label: string; cost: number; dp: number; rate: number; n: number }> = [
    { label: "ТЗ example: 25M, 20% dp, 9%/180mo (Наурыз/Отау)", cost: 25_000_000, dp: 5_000_000, rate: 9, n: 180 },
    { label: "7-20-25: 30M, 20% dp, 7%/300mo", cost: 30_000_000, dp: 6_000_000, rate: 7, n: 300 },
    { label: "Наурыз/Отау: 36M, 20% dp, 9%/228mo", cost: 36_000_000, dp: 7_200_000, rate: 9, n: 228 },
    { label: "Алматы жастары: 20M, 10% dp, 5%/228mo", cost: 20_000_000, dp: 2_000_000, rate: 5, n: 228 },
    { label: "Freedom cascade: 35M, 20% dp, 14.5%/240mo", cost: 35_000_000, dp: 7_000_000, rate: 14.5, n: 240 },
    { label: "БЦК partner: 30M, 20% dp, 18%/180mo", cost: 30_000_000, dp: 6_000_000, rate: 18, n: 180 },
    { label: "Halyk standard: 25M, 20% dp, 20.5%/240mo", cost: 25_000_000, dp: 5_000_000, rate: 20.5, n: 240 },
    { label: "Freedom standard: 70M, 20% dp, 24%/240mo", cost: 70_000_000, dp: 14_000_000, rate: 24, n: 240 },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const r = computePayment({ cost: c.cost, downPayment: c.dp, annualRatePercent: c.rate, termMonths: c.n });
      const ref = referencePmt(c.cost - c.dp, c.rate, c.n);
      // Whole-tenge rounding: our payment is round(ref) ±1 ₸.
      expect(Math.abs(r.monthlyPayment - Math.round(ref))).toBeLessThanOrEqual(1);
      // ТЗ acceptance: divergence from the reference < 1%.
      expect(Math.abs(r.monthlyPayment - ref) / ref).toBeLessThan(0.01);
      // Whole-tenge outputs, internally consistent.
      expect(Number.isInteger(r.monthlyPayment)).toBe(true);
      expect(r.totalToPay).toBe(r.monthlyPayment * c.n);
      expect(r.overpayment).toBe(r.monthlyPayment * c.n - (c.cost - c.dp));
    });
  }
});

describe("computeOtbasy — decoded savings-loan scheme", () => {
  const inp = (cost: number, downPayment: number, annualRatePercent: number): CalcInput => ({
    cost,
    downPayment,
    annualRatePercent,
    termMonths: 228,
  });

  it("Nauryz two-phase reproduces the bank within 1% (deposit covers 50% of cost)", () => {
    // cost 26 239 500, ПВ 20%, 9% → bank phase1 196 796 / phase2 120 701
    const r = computeOtbasy(inp(26_239_500, 5_247_900, 9), {
      loanShare: 0.5,
      mainMonths: 228,
      bridgeMonths: 216,
    });
    expect(r.mainLoan).toBe(13_119_750);
    expect(r.bridgePayment).toBeDefined();
    expect(Math.abs((r.bridgePayment ?? 0) - 196_796)).toBeLessThan(196_796 * 0.01);
    expect(Math.abs(r.mainPayment - 120_701)).toBeLessThan(120_701 * 0.01);
  });

  it("50/50 flat factor reproduces the bank within 0.1% (single phase on 50% of cost)", () => {
    // cost 38 024 000 → bank 269 336
    const r = computeOtbasy(inp(38_024_000, 19_012_000, 8.5), { loanShare: 0.5, mainFactor: 0.014167 });
    expect(r.mainLoan).toBe(19_012_000);
    expect(r.bridgePayment).toBeUndefined();
    expect(Math.abs(r.mainPayment - 269_336)).toBeLessThan(269_336 * 0.001);
  });
});
