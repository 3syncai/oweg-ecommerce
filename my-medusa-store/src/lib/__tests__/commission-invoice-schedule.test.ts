import { test } from "node:test"
import assert from "node:assert/strict"
import { parseExpression } from "cron-parser"
import { COMMISSION_INVOICE_POLL_SCHEDULE, isMonthlyCommissionInvoiceDue } from "../commission-invoice-schedule"

test("monthly invoice runs at 00:05 IST on the seventh, including UTC date rollover", () => {
  for (const time of ["2026-11-06T18:35:00Z", "2026-11-07T00:05:59+05:30", "2026-12-06T18:35:00Z", "2027-01-06T18:35:00Z"]) {
    assert.equal(isMonthlyCommissionInvoiceDue(new Date(time)), true, time)
  }
})
test("other days and minutes cannot generate invoices or repeat monthly emails", () => {
  for (const time of ["2026-11-08T00:05:00+05:30", "2026-11-06T00:05:00+05:30", "2026-11-07T00:00:00+05:30", "2026-11-07T00:10:00+05:30", "2026-11-07T01:05:00+05:30", "2026-11-07T06:05:00+05:30"]) {
    assert.equal(isMonthlyCommissionInvoiceDue(new Date(time)), false, time)
  }
})
for (const tz of ["UTC", "Asia/Kolkata"]) {
  test(`${tz}: scheduler delays remain below Node timer limit and select one monthly run`, () => {
    const start = new Date("2026-11-06T18:00:00Z")
    const cron = parseExpression(COMMISSION_INVOICE_POLL_SCHEDULE, { currentDate: start, tz })
    let previous = start.getTime(), due = 0
    for (let i = 0; i < 600; i++) {
      const next = cron.next().toDate(), delay = next.getTime() - previous
      assert.ok(delay > 0 && delay <= 300_000 && delay < 2_147_483_647)
      if (isMonthlyCommissionInvoiceDue(next)) due++
      previous = next.getTime()
    }
    assert.equal(due, 1)
  })
}
