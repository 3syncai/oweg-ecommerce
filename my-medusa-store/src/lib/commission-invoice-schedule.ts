// Keep native timers short: Medusa's local workflow engine cannot safely arm
// a month-long timeout. This cron runs in the server timezone; eligibility
// below always uses IST, so UTC and Windows/IST servers share the same rule.
export const COMMISSION_INVOICE_POLL_SCHEDULE = "*/5 * * * *"

export function isMonthlyCommissionInvoiceDue(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
  return value("day") === 7 && value("hour") === 0 && value("minute") === 5
}
