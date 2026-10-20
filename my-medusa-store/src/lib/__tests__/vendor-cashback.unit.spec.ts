import {
  adminPayableNetFromLedger,
  applyRunningLedgerBalance,
  calculateVendorLedgerSettlement,
  overlaySaleDeductions,
} from "../vendor-ledger-settlement"
import { buildVendorLedgerRowsFromEarning } from "../vendor-payments-ledger"
import { DEFAULT_LEDGER_RATES, TAX_RATES } from "./ledger-test-fixtures"

const input = { category: "sale" as const, item_price: 1000, logistic_fee: 50, rates: DEFAULT_LEDGER_RATES }

describe("vendor cashback", () => {
  it("adds a rounded credit to payable earnings without changing fees, taxes or bank settlement", () => {
    const base = calculateVendorLedgerSettlement(input)
    const credited = calculateVendorLedgerSettlement({ ...input, cashback_amount: 20.126 })
    expect(credited).toEqual({ ...base, cashback_amount: 20.13, balance_delta: base.balance_delta + 20.13 })
    expect(adminPayableNetFromLedger(credited)).toBeCloseTo(adminPayableNetFromLedger(base) + 20.13)
    const deductions = { reverse_logistic_fee: 10, cancellation_fee: 5 }
    expect(overlaySaleDeductions(credited, deductions, input.rates).balance_delta)
      .toBeCloseTo(overlaySaleDeductions(base, deductions, input.rates).balance_delta + 20.13)
  })

  it.each([undefined, -20, Infinity, NaN])("defaults invalid/nonpositive cashback %s to zero", (amount) => {
    expect(calculateVendorLedgerSettlement({ ...input, cashback_amount: amount }).cashback_amount).toBe(0)
  })

  it("includes cashback exactly once in the running balance across repeated reads and payouts", () => {
    const earning = {
      id: "earning", order_id: "order", order_display_id: "123", status: "CREDITED" as const,
      taxable_amount: 1000, logistic_fee: 50, gst_rate: 18, cashback_amount: 20,
      delivered_at: "2026-10-19T10:00:00Z", unlock_at: null,
    }
    const rows = buildVendorLedgerRowsFromEarning(earning, input.rates, TAX_RATES)
    const original = buildVendorLedgerRowsFromEarning({ ...earning, cashback_amount: 0 }, input.rates, TAX_RATES)
    expect(rows[0].cashback_amount).toBe(20)
    expect(applyRunningLedgerBalance(rows)[0].balance_amount)
      .toBeCloseTo(applyRunningLedgerBalance(original)[0].balance_amount + 20)
    expect(applyRunningLedgerBalance(rows)).toEqual(applyRunningLedgerBalance(rows))
    const payout = { ...rows[0], category: "payment" as const, payment: -50, cashback_amount: 0 }
    expect(applyRunningLedgerBalance([...rows, payout])[1].balance_amount)
      .toBeCloseTo(applyRunningLedgerBalance(rows)[0].balance_amount - 50)
    const reversed = buildVendorLedgerRowsFromEarning({ ...earning, status: "REVERSED" }, input.rates, TAX_RATES)
    expect(reversed.every(row => (row.cashback_amount || 0) === 0)).toBe(true)
  })
})
