/** Integer tenge. All money in the engine is whole ₸ — no fractional units. */
export type Tenge = number;

export interface CalcInput {
  /** Apartment cost, ₸ (integer). */
  cost: Tenge;
  /** Down payment, ₸ (integer), 0..cost. */
  downPayment: Tenge;
  /** Annual interest rate, percent. 0 => zero-rate installment. */
  annualRatePercent: number;
  /** Loan/installment term in months (integer >= 1). */
  termMonths: number;
}

export interface CalcResult {
  /** K = cost − downPayment. */
  loanAmount: Tenge;
  /** The dominant output, rounded to whole ₸. */
  monthlyPayment: Tenge;
  /** monthlyPayment × termMonths. */
  totalToPay: Tenge;
  /** totalToPay − loanAmount. */
  overpayment: Tenge;
  isZeroRate: boolean;
}

/**
 * Otbasy savings-loan scheme. The client's deposit accumulation covers part of the
 * cost, so the main loan amortises only `loanShare` of the cost (not cost − downPayment).
 * With `bridgeMonths` the payment is two-phase: a higher first-period payment on the full
 * (cost − downPayment) bridge loan, then the steady main-loan payment. Decoded from the
 * bank's reference table — see docs/calc-test-cases.md.
 */
export interface OtbasyScheme {
  /** Main loan = round(cost × loanShare); the deposit covers the rest. */
  loanShare: number;
  /** Amortise the main loan over this term (months) at the program rate. */
  mainMonths?: number;
  /** OR a fixed monthly factor applied to the main loan (when the bank quotes a flat factor). */
  mainFactor?: number;
  /** Two-phase: first-period payment amortises (cost − downPayment) over this term (months). */
  bridgeMonths?: number;
}

export interface OtbasyResult {
  /** Main loan principal = round(cost × loanShare). */
  mainLoan: Tenge;
  /** Steady payment after accumulation (the "later" phase, or the only payment). */
  mainPayment: Tenge;
  /** Higher first-period payment (present only for a two-phase scheme). */
  bridgePayment?: Tenge;
}

export type CalcErrorCode =
  | "cost_required"
  | "down_payment_range"
  | "term_range"
  | "rate_negative";

export interface CalcFieldError {
  field: keyof CalcInput;
  code: CalcErrorCode;
}

export interface CalcValidation {
  ok: boolean;
  errors: ReadonlyArray<CalcFieldError>;
}
