import * as XLSX from "xlsx"
import type { VendorPaymentsView } from "@/lib/api/client"

type SettlementRow = VendorPaymentsView["settlements"][number]

const formatIsoDate = (iso: string | null | undefined) => {
  if (!iso) return ""
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso))
  } catch {
    return ""
  }
}

const n = (value: number | undefined) => Number(value) || 0

const HEADER_ROW_1 = [
  "",
  "",
  "",
  "",
  "",
  "A",
  "B",
  "A+B",
  "C",
  "",
  "D",
  "",
  "",
  "E",
  "",
  "",
  "F",
  "",
  "",
  "B",
  "",
  "",
  "G",
  "H",
  "I",
  "J",
  "",
  "",
  "K",
  "",
  "",
  "L",
  "Bank Settlements",
  "",
  "",
  "",
]

const HEADER_ROW_2 = [
  "Order ID",
  "Order Date",
  "Category",
  "Invoice Date",
  "Invoice No",
  "Item Price (A)",
  "Logistics Fee (B)",
  "GST Amount (A+B)",
  "Total Listing Price (C)",
  "Item Status",
  "Platform Fee (D)",
  "Tax Amount",
  "Total",
  "Commission Fee (E)",
  "Tax Amount",
  "Total",
  "Partner Commission (F)",
  "Tax Amount",
  "Total",
  "Logistics Fee (B)",
  "Tax Amount",
  "Total",
  "TCS @0.5% (G)",
  "TDS @0.1% (H)",
  "Bank Settlement",
  "Reverse Logistic Fee",
  "Tax Amount",
  "Total",
  "Cancellation Fee",
  "Tax Amount",
  "Total",
  "Claim Amount",
  "Transaction ID",
  "Payment Date",
  "Payment",
  "Balance Amount",
]

function categoryLabel(row: SettlementRow) {
  const key = row.category || (row.type === "sales" ? "sale" : row.type)
  if (key === "return") return "Return"
  if (key === "claim") return "Claim"
  if (key === "payment") return "Payment"
  if (key === "cancellation") return "Cancellation"
  return "Sale"
}

function toSheetRow(row: SettlementRow) {
  const date = formatIsoDate(row.delivered_at)
  const orderLabel = row.order_display_id ? `#${row.order_display_id}` : row.order_id
  return [
    orderLabel,
    date,
    categoryLabel(row),
    date,
    row.invoice_no || "",
    n(row.taxable_amount),
    n(row.logistic_fee),
    n(row.listing_gst ?? row.gst_amount),
    n(row.listing_total),
    row.item_status || "",
    n(row.platform_fee),
    n(row.platform_gst),
    n(row.platform_total),
    n(row.commission),
    n(row.commission_gst),
    n(row.commission_total),
    n(row.partner_commission),
    n(row.partner_gst),
    n(row.partner_total),
    n(row.logistic_fee),
    n(row.logistic_gst),
    n(row.logistic_total),
    n(row.tcs),
    n(row.tds),
    n(row.bank_settlement ?? row.settlement_amount),
    n(row.return_fee),
    n(row.reverse_logistic_gst),
    n(row.reverse_logistic_total),
    n(row.cancellation_fee),
    n(row.cancellation_gst),
    n(row.cancellation_total),
    n(row.claim_amount),
    row.transaction_id || "",
    formatIsoDate(row.payment_date),
    n(row.payment),
    n(row.balance_amount),
  ]
}

export function downloadPaymentLedgerExcel(rows: SettlementRow[], rangeLabel: string) {
  const body: (string | number)[][] = [HEADER_ROW_1, HEADER_ROW_2]

  for (const row of rows) {
    body.push(toSheetRow(row))
  }

  if (rows.length === 0) {
    body.push(["No transactions in the selected period"])
  }

  const sheet = XLSX.utils.aoa_to_sheet(body)
  sheet["!merges"] = [
    { s: { r: 0, c: 10 }, e: { r: 0, c: 12 } },
    { s: { r: 0, c: 13 }, e: { r: 0, c: 15 } },
    { s: { r: 0, c: 16 }, e: { r: 0, c: 18 } },
    { s: { r: 0, c: 19 }, e: { r: 0, c: 21 } },
    { s: { r: 0, c: 25 }, e: { r: 0, c: 27 } },
    { s: { r: 0, c: 28 }, e: { r: 0, c: 30 } },
    { s: { r: 0, c: 32 }, e: { r: 0, c: 35 } },
  ]
  sheet["!cols"] = HEADER_ROW_2.map((title) => ({
    wch: Math.max(12, Math.min(22, title.length + 2)),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Payment Ledger")
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `Payment-Ledger-${rangeLabel}-${stamp}.xlsx`)
}
