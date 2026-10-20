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

const EXPORT_HEADERS = [
  "Order ID", "Delivery date", "Category", "Invoice date", "Invoice no",
  "Item price", "GST amount", "Logistics", "Logistics GST", "Listing price",
  "Status", "Platform fee", "Platform GST", "Platform total",
  "Commission", "Commission GST", "Commission total",
  "Partner fee", "Partner GST", "Partner total",
  "Logistics fee", "Logistics GST", "Logistics total",
  "TCS", "TDS", "Bank settlement",
  "Customer shipping", "Customer shipping GST", "Customer shipping total",
  "Return fee", "Return GST", "Return total",
  "Cancellation fee", "Cancellation GST", "Cancellation total",
  "Payment gateway fee", "Payment gateway GST", "Payment gateway total",
  "Cashback", "Claim", "Transaction ID", "Payment date", "Payout", "Running balance",
]

function categoryLabel(row: SettlementRow) {
  const key = row.category || (row.type === "sales" ? "sale" : row.type)
  if (key === "return") return "Return"
  if (key === "claim") return "Claim"
  if (key === "payment") return "Payment"
  if (key === "cancellation") return "Cancellation"
  return "Sale"
}

function overlayPayoutFieldsOnOrders(rows: SettlementRow[]) {
  // Build lookup maps keyed by order_id:
  // - payout (transaction_id / payment_date) from payment rows
  // - order_display_id + invoice_no from sale rows
  const payoutInfo = new Map<string, { transaction_id: string; payment_date: string }>()
  const displayIdByOrder = new Map<string, string>()
  const invoiceByOrder = new Map<string, string>()

  for (const row of rows) {
    const kind = row.category || row.type
    if (!row.order_id) continue

    // Collect display IDs and invoice numbers from non-payment rows
    if (kind !== "payment") {
      if (row.order_display_id) displayIdByOrder.set(row.order_id, row.order_display_id)
      if (row.invoice_no) invoiceByOrder.set(row.order_id, row.invoice_no)
    }

    // Collect payout info from payment rows
    if (kind === "payment" && (row.transaction_id || row.payment_date)) {
      payoutInfo.set(row.order_id, {
        transaction_id: row.transaction_id || payoutInfo.get(row.order_id)?.transaction_id || "",
        payment_date: row.payment_date || payoutInfo.get(row.order_id)?.payment_date || "",
      })
    }
  }

  return rows.map((row) => {
    const kind = row.category || row.type
    const isPayment = kind === "payment"
    const ref = payoutInfo.get(row.order_id)
    const sharedDisplayId = displayIdByOrder.get(row.order_id)
    const sharedInvoice = invoiceByOrder.get(row.order_id)

    return {
      ...row,
      // A payout can cover several orders, so it must stay an independent
      // payment row rather than inheriting the first order's ID/invoice.
      order_display_id: isPayment ? null : row.order_display_id || sharedDisplayId || null,
      invoice_no: isPayment ? undefined : row.invoice_no || sharedInvoice || undefined,
      // transaction_id and payment_date ONLY appear on payment rows
      transaction_id: isPayment ? (row.transaction_id || ref?.transaction_id || null) : null,
      payment_date: isPayment ? (row.payment_date || ref?.payment_date || null) : null,
      // Synthesise item_status for payment rows if missing
      item_status:
        row.item_status ||
        (isPayment ? "Paid out" : undefined),
    }
  })
}

function itemStatusLabel(row: SettlementRow): string {
  const kind = row.category || row.type
  // Strip any trailing " · Paid", " · Payout", " · Payment" etc from raw DB status
  const rawClean = (row.item_status || "").replace(/\s*[·\-]\s*(paid|payout|payment).*/i, "").trim()
  if (rawClean) return rawClean
  // Fallback by category
  if (kind === "return") return "Returned"
  if (kind === "cancellation") return "Cancelled"
  if (kind === "claim") return "Claim"
  if (kind === "payment") return "Paid out"
  // sale with no delivered_at → still in transit
  if (!row.delivered_at) return "In transit"
  return "Delivered"
}

export function mapPaymentLedgerExportRow(row: SettlementRow) {
  // Use delivered_at for sale/return rows; fall back to payment_date for payment rows
  const rawDate = row.delivered_at || row.payment_date || null
  const date = formatIsoDate(rawDate)
  const kind = row.category || row.type
  const orderLabel =
    kind === "payment"
      ? "Payout"
      : row.order_display_id
        ? `#${row.order_display_id}`
        : row.order_id
  const isReturnOrCancel = kind === "return" || kind === "cancellation"
  const exportReturnFee = isReturnOrCancel && row.return_fee ? -Math.abs(n(row.return_fee)) : n(row.return_fee)
  const exportReverseGst = isReturnOrCancel && row.reverse_logistic_gst ? -Math.abs(n(row.reverse_logistic_gst)) : n(row.reverse_logistic_gst)
  const exportReverseTotal = isReturnOrCancel && row.reverse_logistic_total ? -Math.abs(n(row.reverse_logistic_total)) : n(row.reverse_logistic_total)
  const exportCancelFee = isReturnOrCancel && row.cancellation_fee ? -Math.abs(n(row.cancellation_fee)) : n(row.cancellation_fee)
  const exportCancelGst = isReturnOrCancel && row.cancellation_gst ? -Math.abs(n(row.cancellation_gst)) : n(row.cancellation_gst)
  const exportCancelTotal = isReturnOrCancel && row.cancellation_total ? -Math.abs(n(row.cancellation_total)) : n(row.cancellation_total)
  const exportPgFee = isReturnOrCancel && row.payment_gateway_fee ? -Math.abs(n(row.payment_gateway_fee)) : n(row.payment_gateway_fee)
  const exportPgGst = isReturnOrCancel && row.payment_gateway_gst ? -Math.abs(n(row.payment_gateway_gst)) : n(row.payment_gateway_gst)
  const exportPgTotal = isReturnOrCancel && row.payment_gateway_total ? -Math.abs(n(row.payment_gateway_total)) : n(row.payment_gateway_total)

  return [
    orderLabel,
    date,
    categoryLabel(row),
    date,
    row.invoice_no || "",
    n(row.taxable_amount),
    n(row.gst_amount),
    n(row.logistic_fee),
    n(row.logistic_gst),
    n(row.listing_total),
    itemStatusLabel(row),
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
    n(row.customer_shipping_fee),
    n(row.customer_shipping_gst),
    n(row.customer_shipping_total),
    exportReturnFee,
    exportReverseGst,
    exportReverseTotal,
    exportCancelFee,
    exportCancelGst,
    exportCancelTotal,
    exportPgFee,
    exportPgGst,
    exportPgTotal,
    n(row.cashback_amount),
    n(row.claim_amount),
    row.transaction_id || "",
    formatIsoDate(row.payment_date),
    n(row.payment),
    n(row.balance_amount),
  ]
}

export async function downloadPaymentLedgerExcel(rows: SettlementRow[], rangeLabel: string) {
  const exportRows = overlayPayoutFieldsOnOrders(rows)
  const data = exportRows.length
    ? exportRows.map(mapPaymentLedgerExportRow)
    : [["No transactions in the selected period"]]
  const worksheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...data])
  worksheet["!cols"] = EXPORT_HEADERS.map((header) => ({ wch: Math.max(12, header.length + 2) }))
  worksheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(EXPORT_HEADERS.length - 1)}${data.length + 1}`,
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payment ledger")
  const file = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(new Blob([file], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `Oweg-Vendor-Payment-Ledger-${rangeLabel}-${stamp}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
