import JSZip from "jszip"
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

const TEMPLATE_URL = "/templates/vendor-payment-ledger.xlsx"
const TEMPLATE_WORKSHEET_PATH = "xl/worksheets/sheet1.xml"
const TEMPLATE_DATA_START_ROW = 4 // Excel row 4; rows 1–3 are the template's grouped headers
const TEMPLATE_DATA_END_ROW = 19
const COLUMN_COUNT = 40 // A:AN

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
  // - order_display_id + invoice_no from sale rows (so payment rows can inherit them)
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
      // Payment rows inherit the display ID and invoice from the matching sale row
      order_display_id: row.order_display_id || sharedDisplayId || null,
      invoice_no: row.invoice_no || sharedInvoice || undefined,
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
  const orderLabel = row.order_display_id ? `#${row.order_display_id}` : row.order_id
  const kind = row.category || row.type
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
    exportReturnFee,
    exportReverseGst,
    exportReverseTotal,
    exportCancelFee,
    exportCancelGst,
    exportCancelTotal,
    exportPgFee,
    exportPgGst,
    exportPgTotal,
    n(row.claim_amount),
    row.transaction_id || "",
    formatIsoDate(row.payment_date),
    n(row.payment),
    n(row.balance_amount),
  ]
}

const columnName = (index: number) => {
  let name = ""
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")

const excelDateSerial = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) + 25_569
}

function templateRowStyle(rowXml: string, column: string) {
  return rowXml.match(new RegExp(`<c r="${column}4" s="(\\d+)"`))?.[1] || "0"
}

function makeDataRow(rowNumber: number, values: Array<string | number> | null, templateRow: string) {
  const rowAttributes = templateRow.match(/^<row\b[^>]*>/)?.[0] || '<row spans="1:40">'
  const rowOpen = rowAttributes.replace(/\br="\d+"/, `r="${rowNumber}"`)
  const cells = Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => {
    const column = columnName(columnIndex)
    const style = templateRowStyle(templateRow, column)
    const value = values?.[columnIndex]
    if (value === undefined || value === null || value === "") {
      return `<c r="${column}${rowNumber}" s="${style}"/>`
    }
    if (typeof value === "number") {
      return `<c r="${column}${rowNumber}" s="${style}"><v>${value}</v></c>`
    }
    // The source template already supplies Excel date formatting for these columns.
    // Write a serial number, not a text date, so its exact d-mmm-yy presentation remains.
    if (columnIndex === 1 || columnIndex === 3 || columnIndex === 37) {
      const serial = excelDateSerial(value)
      if (serial !== null) return `<c r="${column}${rowNumber}" s="${style}"><v>${serial}</v></c>`
    }
    return `<c r="${column}${rowNumber}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
  }).join("")
  return `${rowOpen}${cells}</row>`
}

/**
 * Starts from the finance-approved workbook so downloaded reports retain its
 * exact grouped headers, colours, widths, merged cells and number formats.
 */
export async function downloadPaymentLedgerExcel(rows: SettlementRow[], rangeLabel: string) {
  const exportRows = overlayPayoutFieldsOnOrders(rows)
  const response = await fetch(TEMPLATE_URL)
  if (!response.ok) throw new Error("Payment ledger template could not be loaded")
  const archive = await JSZip.loadAsync(await response.arrayBuffer())
  const worksheet = archive.file(TEMPLATE_WORKSHEET_PATH)
  if (!worksheet) throw new Error("Payment ledger template is missing its Sheet4 layout")
  let sheetXml = await worksheet.async("string")
  const templateRow = sheetXml.match(/<row\b[^>]*\br="4"[^>]*>[\s\S]*?<\/row>/)?.[0]
  if (!templateRow) throw new Error("Payment ledger template is missing its data-row format")

  const data = exportRows.length
    ? exportRows.map(mapPaymentLedgerExportRow)
    : [["No transactions in the selected period"]]
  const templateRowCount = TEMPLATE_DATA_END_ROW - TEMPLATE_DATA_START_ROW + 1
  for (let index = 0; index < templateRowCount; index += 1) {
    const rowNumber = TEMPLATE_DATA_START_ROW + index
    const replacement = makeDataRow(rowNumber, data[index] || null, templateRow)
    sheetXml = sheetXml.replace(new RegExp(`<row\\b[^>]*\\br="${rowNumber}"[^>]*>[\\s\\S]*?<\\/row>`), replacement)
  }
  if (data.length > templateRowCount) {
    const additionalRows = data
      .slice(templateRowCount)
      .map((values, index) => makeDataRow(TEMPLATE_DATA_END_ROW + index + 1, values, templateRow))
      .join("")
    sheetXml = sheetXml.replace("</sheetData>", `${additionalRows}</sheetData>`)
  }
  const finalRow = Math.max(TEMPLATE_DATA_END_ROW, TEMPLATE_DATA_START_ROW + data.length - 1)
  sheetXml = sheetXml.replace(/<dimension ref="A1:AN\d+"\/>/, `<dimension ref="A1:AN${finalRow}"/>`)
  archive.file(TEMPLATE_WORKSHEET_PATH, sheetXml)
  const stamp = new Date().toISOString().slice(0, 10)
  const file = await archive.generateAsync({ type: "blob", compression: "DEFLATE" })
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = `Oweg-Vendor-Payment-Ledger-${rangeLabel}-${stamp}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
