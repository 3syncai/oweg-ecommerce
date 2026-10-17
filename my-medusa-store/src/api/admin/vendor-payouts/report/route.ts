import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import * as XLSX from "xlsx"
import {
  buildVendorPaymentsView,
  parsePayoutOrderIds,
} from "../../../../lib/vendor-payments-ledger"

type SettlementRow = {
  vendor_name?: string
  vendor_email?: string
  id: string
  order_id: string
  order_display_id: string | null
  product_name: string
  type: string
  category?: string
  invoice_no?: string
  item_status?: string
  order_amount?: number
  taxable_amount?: number
  gst_amount?: number
  listing_total?: number
  platform_fee?: number
  platform_gst?: number
  platform_total?: number
  commission?: number
  commission_gst?: number
  commission_total?: number
  partner_commission?: number
  partner_gst?: number
  partner_total?: number
  logistic_fee?: number
  logistic_gst?: number
  logistic_total?: number
  tcs?: number
  tds?: number
  bank_settlement?: number
  settlement_amount?: number
  customer_shipping_fee?: number
  customer_shipping_gst?: number
  customer_shipping_total?: number
  return_fee?: number
  reverse_logistic_gst?: number
  reverse_logistic_total?: number
  cancellation_fee?: number
  cancellation_gst?: number
  cancellation_total?: number
  payment_gateway_fee?: number
  payment_gateway_gst?: number
  payment_gateway_total?: number
  claim_amount?: number
  transaction_id?: string | null
  payment_date?: string | null
  payment?: number
  balance_amount?: number
  status?: string
  delivered_at?: string | null
  unlock_at?: string | null
}

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

const n = (value: number | undefined | null) => Number(value) || 0

const startOfDayIst = (d: Date) => {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return new Date(`${key}T00:00:00+05:30`)
}

const endOfDayIst = (d: Date) => {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return new Date(`${key}T23:59:59.999+05:30`)
}

const EXPORT_HEADERS = [
  "Vendor Name",
  "Vendor Email",
  "Order ID",
  "Delivery date",
  "Category",
  "Invoice date",
  "Invoice no",
  "Item price",
  "GST amount",
  "Logistics",
  "Logistics GST",
  "Listing price",
  "Status",
  "Platform fee",
  "Platform GST",
  "Platform total",
  "Commission",
  "Commission GST",
  "Commission total",
  "Partner fee",
  "Partner GST",
  "Partner total",
  "Logistics fee",
  "Logistics GST",
  "Logistics total",
  "TCS",
  "TDS",
  "Bank settlement",
  "Customer shipping",
  "Customer shipping GST",
  "Customer shipping total",
  "Return fee",
  "Return GST",
  "Return total",
  "Cancellation fee",
  "Cancellation GST",
  "Cancellation total",
  "Payment gateway fee",
  "Payment gateway GST",
  "Payment gateway total",
  "Claim",
  "Transaction ID",
  "Payment date",
  "Payout",
  "Running balance",
]

const PAYOUT_SUMMARY_HEADERS = [
  "Payout ID",
  "Vendor Name",
  "Vendor Email",
  "Bank Name",
  "Account Number",
  "IFSC Code",
  "Total Revenue",
  "Commission Amount",
  "Net Amount Paid",
  "Transaction ID / UTR",
  "Payment Date",
  "Payment Method",
  "Status",
  "Order Count",
  "Paid Order IDs",
  "Notes",
]

function categoryLabel(row: SettlementRow) {
  const key = row.category || (row.type === "sales" ? "sale" : row.type)
  if (key === "return") return "Return"
  if (key === "claim") return "Claim"
  if (key === "payment") return "Payment"
  if (key === "cancellation") return "Cancellation"
  return "Sale"
}

function itemStatusLabel(row: SettlementRow): string {
  const kind = row.category || row.type
  const rawClean = (row.item_status || "").replace(/\s*[·\-]\s*(paid|payout|payment).*/i, "").trim()
  if (rawClean) return rawClean
  if (kind === "return") return "Returned"
  if (kind === "cancellation") return "Cancelled"
  if (kind === "claim") return "Claim"
  if (kind === "payment") return "Paid out"
  if (row.status === "PAID" || row.transaction_id) return "Paid out"
  if (!row.delivered_at) return "In transit"
  return "Delivered"
}

function overlayPayoutFieldsOnOrders(rows: SettlementRow[]) {
  const payoutInfo = new Map<string, { transaction_id: string; payment_date: string }>()
  const displayIdByOrder = new Map<string, string>()
  const invoiceByOrder = new Map<string, string>()

  for (const row of rows) {
    const kind = row.category || row.type
    if (!row.order_id) continue

    if (kind !== "payment") {
      if (row.order_display_id) displayIdByOrder.set(row.order_id, row.order_display_id)
      if (row.invoice_no) invoiceByOrder.set(row.order_id, row.invoice_no)
    }

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
    const txnId = row.transaction_id || ref?.transaction_id || null
    const payDate = row.payment_date || ref?.payment_date || null

    return {
      ...row,
      order_display_id: row.order_display_id || sharedDisplayId || null,
      invoice_no: row.invoice_no || sharedInvoice || undefined,
      transaction_id: txnId,
      payment_date: payDate,
      item_status:
        row.item_status ||
        (isPayment || row.status === "PAID" || txnId ? "Paid out" : undefined),
    }
  })
}

function mapPaymentLedgerExportRow(row: SettlementRow) {
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
    row.vendor_name || "",
    row.vendor_email || "",
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
    n(row.claim_amount),
    row.transaction_id || "",
    formatIsoDate(row.payment_date),
    n(row.payment),
    n(row.balance_amount),
  ]
}

function resolveDateWindow(range: string, customFrom?: string, customTo?: string): { from: Date; to: Date; label: string } | null {
  const now = new Date()
  const to = endOfDayIst(now)

  if (range === "1d") {
    return { from: startOfDayIst(now), to, label: "1-day" }
  }
  if (range === "1m") {
    const from = startOfDayIst(now)
    from.setMonth(from.getMonth() - 1)
    return { from, to, label: "1-month" }
  }
  if (range === "3m") {
    const from = startOfDayIst(now)
    from.setMonth(from.getMonth() - 3)
    return { from, to, label: "3-month" }
  }
  if (range === "6m") {
    const from = startOfDayIst(now)
    from.setMonth(from.getMonth() - 6)
    return { from, to, label: "6-month" }
  }
  if (range === "1y") {
    const from = startOfDayIst(now)
    from.setFullYear(from.getFullYear() - 1)
    return { from, to, label: "1-year" }
  }
  if (range === "custom" && customFrom && customTo) {
    const from = new Date(`${customFrom}T00:00:00+05:30`)
    const customEnd = new Date(`${customTo}T23:59:59.999+05:30`)
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(customEnd.getTime())) {
      return { from, to: customEnd, label: `custom-${customFrom}_to_${customTo}` }
    }
  }
  return null
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const vendorId = typeof req.query?.vendor_id === "string" && req.query.vendor_id !== "all" ? req.query.vendor_id.trim() : null
    const range = typeof req.query?.range === "string" ? req.query.range.trim() : "all"
    const customFrom = typeof req.query?.from === "string" ? req.query.from.trim() : undefined
    const customTo = typeof req.query?.to === "string" ? req.query.to.trim() : undefined
    const paidOnly = req.query?.paid_only === "true" || req.query?.paid_only === "1"
    const format = typeof req.query?.format === "string" ? req.query.format.trim().toLowerCase() : "xlsx"

    const dateWindow = resolveDateWindow(range, customFrom, customTo)

    // 1. Fetch vendors
    const vendorRows = vendorId
      ? (await pool.query(`SELECT id, name, email, store_name, bank_name, account_no, ifsc_code FROM vendor WHERE id = $1`, [vendorId])).rows
      : (await pool.query(`SELECT id, name, email, store_name, bank_name, account_no, ifsc_code FROM vendor WHERE is_approved = true ORDER BY name ASC`)).rows

    if (vendorRows.length === 0) {
      if (format === "json") {
        res.json({ count: 0, payouts_count: 0, rows: [] })
        return
      }
    }

    // 2. Fetch completed vendor_payout rows for Payouts Summary
    const payoutResult = vendorId
      ? await pool.query(
          `
            SELECT
              vp.id,
              vp.vendor_id,
              v.name AS vendor_name,
              v.email AS vendor_email,
              v.bank_name,
              v.account_no,
              v.ifsc_code,
              vp.amount,
              vp.commission_amount,
              vp.net_amount,
              vp.commission_rate,
              vp.transaction_id,
              vp.payment_method,
              vp.status,
              vp.notes,
              vp.order_ids,
              vp.created_at
            FROM vendor_payout vp
            JOIN vendor v ON vp.vendor_id = v.id
            WHERE vp.vendor_id = $1
              AND lower(coalesce(vp.status, '')) IN ('processed', 'completed', 'paid')
            ORDER BY vp.created_at DESC
          `,
          [vendorId]
        )
      : await pool.query(
          `
            SELECT
              vp.id,
              vp.vendor_id,
              v.name AS vendor_name,
              v.email AS vendor_email,
              v.bank_name,
              v.account_no,
              v.ifsc_code,
              vp.amount,
              vp.commission_amount,
              vp.net_amount,
              vp.commission_rate,
              vp.transaction_id,
              vp.payment_method,
              vp.status,
              vp.notes,
              vp.order_ids,
              vp.created_at
            FROM vendor_payout vp
            JOIN vendor v ON vp.vendor_id = v.id
            WHERE lower(coalesce(vp.status, '')) IN ('processed', 'completed', 'paid')
            ORDER BY vp.created_at DESC
          `
        )

    let filteredPayouts = payoutResult.rows
    if (dateWindow) {
      filteredPayouts = filteredPayouts.filter((p) => {
        const time = new Date(p.created_at).getTime()
        return time >= dateWindow.from.getTime() && time <= dateWindow.to.getTime()
      })
    }

    // 3. Build ledger rows across vendors
    const allLedgerRows: SettlementRow[] = []

    for (const v of vendorRows) {
      try {
        const vendorView = await buildVendorPaymentsView(v.id, pool)
        const vendorSettlements = (vendorView.settlements || []).map((s) => ({
          ...s,
          vendor_name: v.name || v.store_name || "",
          vendor_email: v.email || "",
        }))
        const overlaid = overlayPayoutFieldsOnOrders(vendorSettlements)
        allLedgerRows.push(...overlaid)
      } catch (err) {
        console.error(`Failed to build payment view for vendor ${v.id}:`, err)
      }
    }

    // 4. Filter ledger rows
    let filteredLedger = allLedgerRows
    if (dateWindow) {
      filteredLedger = filteredLedger.filter((row) => {
        const dateStr = row.delivered_at || row.payment_date
        if (!dateStr) return true
        const t = new Date(dateStr).getTime()
        return t >= dateWindow.from.getTime() && t <= dateWindow.to.getTime()
      })
    }

    if (paidOnly) {
      filteredLedger = filteredLedger.filter((row) => {
        const kind = row.category || row.type
        return (
          kind === "payment" ||
          row.status === "PAID" ||
          Boolean(row.transaction_id) ||
          Boolean(row.payment_date)
        )
      })
    }

    // Sort by delivered_at / payment_date
    filteredLedger.sort((a, b) => {
      const ta = new Date(a.delivered_at || a.payment_date || 0).getTime()
      const tb = new Date(b.delivered_at || b.payment_date || 0).getTime()
      return ta - tb
    })

    if (format === "json") {
      res.json({
        count: filteredLedger.length,
        payouts_count: filteredPayouts.length,
        range_label: dateWindow?.label || "all-time",
      })
      return
    }

    // 5. Generate Excel file
    const ledgerData = filteredLedger.length
      ? filteredLedger.map(mapPaymentLedgerExportRow)
      : [["No payment records in the selected period"]]

    const ledgerSheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...ledgerData])
    ledgerSheet["!cols"] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 3) }))
    if (filteredLedger.length) {
      ledgerSheet["!autofilter"] = {
        ref: `A1:${XLSX.utils.encode_col(EXPORT_HEADERS.length - 1)}${ledgerData.length + 1}`,
      }
    }

    // Payout summary sheet
    const payoutData = filteredPayouts.length
      ? filteredPayouts.map((p) => {
          const orderIds = parsePayoutOrderIds(p.order_ids)
          return [
            p.id,
            p.vendor_name || "",
            p.vendor_email || "",
            p.bank_name || "",
            p.account_no || "",
            p.ifsc_code || "",
            n(p.amount),
            n(p.commission_amount),
            n(p.net_amount),
            p.transaction_id || "",
            formatIsoDate(p.created_at),
            p.payment_method || "bank_transfer",
            p.status || "completed",
            orderIds.length,
            orderIds.join(", "),
            p.notes || "",
          ]
        })
      : [["No completed payouts found in the selected period"]]

    const payoutSheet = XLSX.utils.aoa_to_sheet([PAYOUT_SUMMARY_HEADERS, ...payoutData])
    payoutSheet["!cols"] = PAYOUT_SUMMARY_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 3) }))
    if (filteredPayouts.length) {
      payoutSheet["!autofilter"] = {
        ref: `A1:${XLSX.utils.encode_col(PAYOUT_SUMMARY_HEADERS.length - 1)}${payoutData.length + 1}`,
      }
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, ledgerSheet, "Payment ledger")
    XLSX.utils.book_append_sheet(workbook, payoutSheet, "Payouts Summary")

    const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true })
    const stamp = new Date().toISOString().slice(0, 10)
    const rangeTag = dateWindow?.label || "all-time"
    const vendorTag = vendorId && vendorRows[0]?.name ? vendorRows[0].name.replace(/\s+/g, "_") : "All-Vendors"
    const filename = `Oweg-Vendor-Payments-Report-${vendorTag}-${rangeTag}-${stamp}.xlsx`

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Cache-Control", "no-cache")
    res.send(fileBuffer)
  } catch (error: any) {
    console.error("Admin payments report export error:", error)
    res.status(500).json({
      message: "Failed to generate payments report",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
