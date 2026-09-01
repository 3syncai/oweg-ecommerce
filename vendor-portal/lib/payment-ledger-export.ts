import * as XLSX from "xlsx"
import type { VendorPaymentsView } from "@/lib/api/client"

type SettlementRow = VendorPaymentsView["settlements"][number]

const SERVICE_GST_RATE = 0.18

const round2 = (n: number) => Math.round(n * 100) / 100

const neg = (n: number) => (n === 0 ? 0 : -Math.abs(n))

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

const gstRateDecimal = (rate: number | undefined) => {
  const r = Number(rate) || 0
  if (r > 1) return r / 100
  return r
}

const itemStatusLabel = (row: SettlementRow) => {
  if (row.type === "return") return "Returned"
  if (row.type === "claim") return "Claim credited"
  if (row.status === "REVERSED") return "Returned"
  if (row.status === "PAID") return "Delivered · Paid"
  return "Delivered"
}

/** Commission is shown on sale amount (inclusive), matching finance ledger template. */
function commissionBlock(saleAmount: number, commissionRate: number) {
  const base = round2((Math.abs(saleAmount) * commissionRate) / 100)
  const commissionRs = neg(base)
  const taxAmount = neg(round2(base * SERVICE_GST_RATE))
  const total = round2(commissionRs + taxAmount)
  return {
    rate: commissionRate,
    commissionRs,
    taxRate: SERVICE_GST_RATE,
    taxAmount,
    total,
  }
}

function feeBlock(fee: number) {
  const base = Math.abs(fee)
  if (base <= 0) {
    return { feeRs: 0, taxRate: 0, taxAmount: 0, total: 0 }
  }
  const feeRs = neg(base)
  const taxAmount = neg(round2(base * SERVICE_GST_RATE))
  return {
    feeRs,
    taxRate: SERVICE_GST_RATE,
    taxAmount,
    total: round2(feeRs + taxAmount),
  }
}

function buildItemCostRow(row: SettlementRow, opts: { includePaymentMeta: boolean }) {
  const saleAmount = Math.abs(Number(row.order_amount) || 0)
  const taxable = Math.abs(Number(row.taxable_amount) || 0)
  const gstRate = gstRateDecimal(row.gst_rate)
  const taxAmount = Math.abs(Number(row.gst_amount) || 0)
  const delivered = formatIsoDate(row.delivered_at)
  const orderLabel = row.order_display_id ? `#${row.order_display_id}` : row.order_id
  const invoiceNo = row.order_display_id ? `INV-${row.order_display_id}` : ""

  if (row.type === "return") {
    const reverse = feeBlock(Number(row.return_fee) || 0)
    return [
      "",
      opts.includePaymentMeta ? delivered : "",
      opts.includePaymentMeta ? Number(row.settlement_amount) || 0 : "",
      "Item Cost",
      delivered,
      orderLabel,
      invoiceNo,
      0,
      0,
      0,
      0,
      saleAmount,
      itemStatusLabel(row),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      reverse.feeRs,
      reverse.taxRate,
      reverse.taxAmount,
      reverse.total,
      0,
      0,
      0,
      0,
      "",
    ]
  }

  if (row.type === "claim") {
    const claimAmount = round2(Number(row.settlement_amount) || 0)
    return [
      "",
      opts.includePaymentMeta ? delivered : "",
      opts.includePaymentMeta ? claimAmount : "",
      "Claim credit",
      delivered,
      orderLabel,
      invoiceNo,
      0,
      0,
      0,
      0,
      0,
      0,
      itemStatusLabel(row),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      claimAmount,
      0,
      0,
      "",
    ]
  }

  const commission = commissionBlock(saleAmount, Number(row.commission_rate) || 0)
  const logistic = feeBlock(Number(row.logistic_fee) || 0)
  const reverse = feeBlock(Number(row.return_fee) || 0)

  return [
    "",
    opts.includePaymentMeta ? delivered : "",
    opts.includePaymentMeta ? Number(row.settlement_amount) || 0 : "",
    "Item Cost",
    delivered,
    orderLabel,
    invoiceNo,
    taxable,
    gstRate,
    taxAmount,
    saleAmount,
    0,
    itemStatusLabel(row),
    commission.rate,
    commission.commissionRs,
    commission.taxRate,
    commission.taxAmount,
    commission.total,
    logistic.feeRs,
    logistic.taxRate,
    logistic.taxAmount,
    logistic.total,
    reverse.feeRs,
    reverse.taxRate,
    reverse.taxAmount,
    reverse.total,
    0,
    0,
    neg(Number(row.tcs) || 0),
    neg(Number(row.tds) || 0),
    "",
  ]
}

const HEADER_ROW_1 = [
  "Payment Details",
  "",
  "",
  "",
  "Transaction Summary",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Deduction",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Taxes",
  "",
  "",
]

const HEADER_ROW_2 = [
  "NEFT ID",
  "Payment Date",
  "Bank Settlement Value (Rs.)\n= SUM(J:R)",
  "Description",
  "Invoice Date",
  "Order ID",
  "Invoice No",
  "Sale Taxable Value",
  "Tax Rate",
  "Tax Amount",
  "Sale Amount (Rs.)",
  "Refund (Rs.)",
  "Item Status",
  "Commission Rate (%)",
  "Commission (Rs.)",
  "Tax Rate",
  "Tax Amount",
  "Total",
  "Loigistic Fee (Rs.)",
  "Tax Rate",
  "Tax Amount",
  "Total",
  "Reverse Logistic Fee (Rs.)",
  "Tax Rate",
  "Tax Amount",
  "Total",
  "Product Cancellation Fee (Rs.)",
  "Claim Amount (Rs.)",
  "TCS (Rs.) 0.5%",
  "TDS (Rs.) 0.1%",
  "",
]

export function downloadPaymentLedgerExcel(
  rows: SettlementRow[],
  rangeLabel: string
) {
  const body: (string | number)[][] = [HEADER_ROW_1, HEADER_ROW_2, []]

  for (const row of rows) {
    body.push(buildItemCostRow(row, { includePaymentMeta: true }))
  }

  if (rows.length === 0) {
    body.push(["No transactions in the selected period"])
  }

  const sheet = XLSX.utils.aoa_to_sheet(body)

  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 12 } },
    { s: { r: 0, c: 13 }, e: { r: 0, c: 27 } },
    { s: { r: 0, c: 28 }, e: { r: 0, c: 30 } },
  ]

  sheet["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 4 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Payment Ledger")
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `Payment-Ledger-${rangeLabel}-${stamp}.xlsx`)
}
