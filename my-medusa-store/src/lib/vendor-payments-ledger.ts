import type { Pool } from "pg"
import {
  applyRunningLedgerBalance,
  buildLedgerRatesForVendor,
  calculateVendorLedgerSettlement,
  overlaySaleDeductions,
  type LedgerRates,
} from "./vendor-ledger-settlement"
import {
  getMarketplaceTaxRates,
} from "./vendor-marketplace-tax"
import {
  formatOrderFallback,
  getVendorEarningsSummary,
  repairClaimCreditsWithoutCommission,
  recomputeUnpaidVendorLedger,
  settlementFromLedger,
  syncVendorEarningsStatuses,
  VENDOR_EARNINGS_UNLOCK_MINUTES,
  type VendorPaymentsView,
  type VendorPaymentSettlement,
} from "./vendor-earnings"

type HistoryRow = {
  id: string
  order_id: string
  order_display_id: string | null
  status: VendorPaymentSettlement["status"]
  gross_amount: string | number
  taxable_amount: string | number
  gst_rate: string | number
  commission_rate: string | number
  platform_fee_rate: string | number | null
  partner_commission_rate: string | number | null
  tcs_rate: string | number
  tds_rate: string | number
  logistic_fee: string | number
  return_fee: string | number
  cancellation_fee: string | number
  net_amount: string | number
  delivered_at: string | null
  unlock_at: string | null
  product_name: string | null
}

type PayoutRow = {
  id: string
  net_amount: string | number
  transaction_id: string | null
  created_at: string
  order_ids: unknown
}

const isTodayIst = (iso: string | null, todayKey: string) => {
  if (!iso) return false
  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso)) === todayKey
  )
}

export function parsePayoutOrderIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((id) => String(id || "").trim()).filter(Boolean)
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsePayoutOrderIds(parsed)
    } catch {
      return value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function attachPayoutReferencesToOrders<
  T extends {
    category?: string | null
    type?: string | null
    order_id: string
    transaction_id?: string | null
    payment_date?: string | null
  },
>(
  rows: T[],
  payouts: Array<{
    transaction_id?: string | null
    created_at?: string | null
    payment_date?: string | null
    order_ids?: unknown
  }>
) {
  const latest = new Map<string, { transaction_id: string | null; payment_date: string }>()
  for (const payout of payouts) {
    const paymentDate = payout.payment_date || payout.created_at || null
    if (!payout.transaction_id && !paymentDate) continue
    for (const orderId of parsePayoutOrderIds(payout.order_ids)) {
      latest.set(orderId, {
        transaction_id: payout.transaction_id || latest.get(orderId)?.transaction_id || null,
        payment_date: paymentDate || latest.get(orderId)?.payment_date || "",
      })
    }
  }

  for (const row of rows) {
    const kind = row.category || row.type
    if (kind === "payment") continue
    const ref = latest.get(row.order_id)
    if (!ref) continue
    if (!row.transaction_id && ref.transaction_id) row.transaction_id = ref.transaction_id
    if (!row.payment_date && ref.payment_date) row.payment_date = ref.payment_date
  }
  return rows
}

export type EarningLedgerSource = {
  id: string
  order_id: string
  order_display_id: string | null
  product_name?: string | null
  status: VendorPaymentSettlement["status"]
  taxable_amount: number
  logistic_fee: number
  return_fee?: number
  cancellation_fee?: number
  gst_rate: number
  gross_amount?: number
  net_amount?: number
  delivered_at: string | null
  unlock_at: string | null
}

export type PayoutLedgerSource = {
  id: string
  net_amount: number
  transaction_id?: string | null
  created_at: string
  order_ids?: unknown
}

/**
 * Pure sale / return / claim rows used by Payments UI + Excel.
 * Same engine as admin recompute — no DB.
 */
export function buildVendorLedgerRowsFromEarning(
  row: EarningLedgerSource,
  rates: LedgerRates,
  taxRates: { tcs_rate: number; tds_rate: number }
): VendorPaymentSettlement[] {
  const orderIdKey = String(row.order_id || "")
  const isClaim = orderIdKey.startsWith("claim:")
  const isClawback = orderIdKey.startsWith("clawback:")
  const isCancelFee = orderIdKey.startsWith("cancel-fee:")
  const productName = row.product_name?.trim() || formatOrderFallback(row.order_display_id, row.order_id)
  const gstRate = Number(row.gst_rate) || 18
  const itemPrice = Number(row.taxable_amount) || 0
  const logisticFee = Number(row.logistic_fee) || 0
  const returnFee = Number(row.return_fee) || 0
  const cancellationFee = Number(row.cancellation_fee) || 0

  if (isCancelFee) {
    const fee = Math.abs(cancellationFee || 0)
    const ledger = calculateVendorLedgerSettlement({
      category: "cancellation",
      item_price: 0,
      logistic_fee: logisticFee,
      cancellation_fee: fee,
      rates,
    })
    return [
      settlementFromLedger({
        id: row.id,
        order_id: row.order_id,
        order_display_id: row.order_display_id,
        product_name: "Cancellation charge",
        status: row.status,
        delivered_at: row.delivered_at,
        unlock_at: row.unlock_at,
        ledger,
        tcs_rate: taxRates.tcs_rate,
        tds_rate: taxRates.tds_rate,
        gst_rate: 0,
      }),
    ]
  }

  if (isClaim || isClawback) {
    const rawNet = Number(row.net_amount) || 0
    const rawGross = Number(row.gross_amount) || 0
    // Clawbacks are stored as negative CREDITED nets; claims are positive.
    const claimAmount = isClawback
      ? Math.abs(rawNet || rawGross)
      : Math.max(rawGross, rawNet, itemPrice)
    const ledger = calculateVendorLedgerSettlement({
      category: "claim",
      item_price: 0,
      logistic_fee: 0,
      claim_amount: claimAmount,
      rates,
    })
    const signedLedger = isClawback
      ? {
          ...ledger,
          claim_amount: -Math.abs(ledger.claim_amount),
          bank_settlement: -Math.abs(ledger.bank_settlement),
          balance_delta: -Math.abs(ledger.balance_delta),
        }
      : ledger
    return [
      settlementFromLedger({
        id: row.id,
        order_id: row.order_id,
        order_display_id: row.order_display_id,
        product_name: isClawback ? "Paid clawback (return/cancel)" : "Claim settlement",
        status: row.status,
        delivered_at: row.delivered_at,
        unlock_at: row.unlock_at,
        ledger: signedLedger,
        tcs_rate: taxRates.tcs_rate,
        tds_rate: taxRates.tds_rate,
        gst_rate: 0,
      }),
    ]
  }

  let saleLedger = calculateVendorLedgerSettlement({
    category: "sale",
    item_price: itemPrice,
    logistic_fee: logisticFee,
    rates,
  })
  if (row.status !== "REVERSED") {
    saleLedger = overlaySaleDeductions(
      saleLedger,
      { reverse_logistic_fee: returnFee, cancellation_fee: cancellationFee },
      rates
    )
  }

  const rows: VendorPaymentSettlement[] = [
    settlementFromLedger({
      id: `${row.id}:sale`,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      product_name: productName,
      status: row.status === "REVERSED" ? "REVERSED" : row.status,
      delivered_at: row.delivered_at,
      unlock_at: row.unlock_at,
      ledger: saleLedger,
      tcs_rate: taxRates.tcs_rate,
      tds_rate: taxRates.tds_rate,
      gst_rate: gstRate,
    }),
  ]

  if (row.status === "REVERSED") {
    const returnLedger = calculateVendorLedgerSettlement({
      category: "return",
      item_price: itemPrice,
      logistic_fee: logisticFee,
      reverse_logistic_fee: returnFee,
      cancellation_fee: cancellationFee,
      rates,
    })
    rows.push(
      settlementFromLedger({
        id: `${row.id}:return`,
        order_id: row.order_id,
        order_display_id: row.order_display_id,
        product_name: productName,
        status: "REVERSED",
        delivered_at: row.delivered_at,
        unlock_at: null,
        ledger: returnLedger,
        tcs_rate: taxRates.tcs_rate,
        tds_rate: taxRates.tds_rate,
        gst_rate: gstRate,
      })
    )
  }

  return rows
}

export function buildVendorLedgerRowFromPayout(
  payout: PayoutLedgerSource,
  rates: LedgerRates
): VendorPaymentSettlement | null {
  const amount = Number(payout.net_amount) || 0
  if (amount <= 0) return null
  const ledger = calculateVendorLedgerSettlement({
    category: "payment",
    item_price: 0,
    logistic_fee: 0,
    payment_amount: amount,
    rates,
  })
  const linkedOrders = parsePayoutOrderIds(payout.order_ids)
  const firstOrder = linkedOrders[0] || `payout:${payout.id}`
  return settlementFromLedger({
    id: `payout:${payout.id}`,
    order_id: firstOrder,
    order_display_id: null,
    product_name: "Payout",
    status: "PAYMENT",
    delivered_at: payout.created_at,
    unlock_at: null,
    ledger,
    tcs_rate: 0,
    tds_rate: 0,
    gst_rate: 0,
    transaction_id: payout.transaction_id,
    payment_date: payout.created_at,
  })
}

export function summarizeVendorPaymentCards(
  settlements: VendorPaymentSettlement[],
  extras: {
    todayKey: string
    available_balance: number
    unlocking_balance: number
    total_withdrawn: number
  }
): VendorPaymentsView["cards"] {
  const sales = settlements.filter((row) => row.category === "sale")
  const todaySales = sales.filter((row) => isTodayIst(row.delivered_at || null, extras.todayKey))
  const todayReturns = settlements.filter(
    (row) => row.category === "return" && isTodayIst(row.delivered_at || null, extras.todayKey)
  )
  const sum = (rows: VendorPaymentSettlement[], key: keyof VendorPaymentSettlement) =>
    rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
  const settlementBalance =
    (Number(extras.available_balance) || 0) + (Number(extras.total_withdrawn) || 0)

  return {
    full_sale: sum(sales, "listing_total"),
    taxes: sum(sales, "listing_gst"),
    lifetime_commission: sum(sales, "commission"),
    lifetime_tcs: Math.abs(sum(sales, "tcs")),
    lifetime_tds: Math.abs(sum(sales, "tds")),
    total_sale: sum(todaySales, "listing_total") + sum(todayReturns, "listing_total"),
    gst: sum(todaySales, "listing_gst"),
    commission: Math.abs(sum(todaySales, "commission")),
    tcs: Math.abs(sum(todaySales, "tcs")),
    tds: Math.abs(sum(todaySales, "tds")),
    logistic_fee: Math.abs(sum(todaySales, "logistic_fee")),
    return_fee: Math.abs(sum(todayReturns, "return_fee")),
    platform_fee: Math.abs(sum(todaySales, "platform_fee")),
    partner_commission: Math.abs(sum(todaySales, "partner_commission")),
    settlement_balance: settlementBalance,
    balance: Number(extras.available_balance) || 0,
    pending_payment: extras.available_balance,
    unlocking_payment: extras.unlocking_balance,
    withdrawn: extras.total_withdrawn,
  }
}

export async function buildVendorPaymentsView(
  vendorId: string,
  pool: Pool
): Promise<VendorPaymentsView> {
  await syncVendorEarningsStatuses(pool)
  await repairClaimCreditsWithoutCommission(vendorId, pool)
  await recomputeUnpaidVendorLedger(vendorId, pool)
  const [summary, taxRates, historyResult, payoutResult] =
    await Promise.all([
      getVendorEarningsSummary(vendorId, pool),
      getMarketplaceTaxRates(pool),
      pool.query<HistoryRow>(
        `
          SELECT
            vel.id,
            vel.order_id,
            vel.order_display_id,
            vel.status,
            vel.gross_amount,
            vel.taxable_amount,
            vel.gst_rate,
            vel.commission_rate,
            vel.platform_fee_rate,
            vel.partner_commission_rate,
            vel.tcs_rate,
            vel.tds_rate,
            COALESCE(vel.logistic_fee, 0) AS logistic_fee,
            COALESCE(vel.return_fee, 0) AS return_fee,
            COALESCE(vel.cancellation_fee, 0) AS cancellation_fee,
            vel.net_amount,
            vel.delivered_at,
            vel.unlock_at,
            (
              SELECT COALESCE(oli.title, 'Order #' || COALESCE(vel.order_display_id, LEFT(vel.order_id, 8)))
              FROM order_item oi
              JOIN order_line_item oli ON oi.item_id = oli.id
              LEFT JOIN product_variant pv ON oli.variant_id = pv.id
              LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
              WHERE oi.order_id = vel.order_id
                AND p.metadata->>'vendor_id' = $1
              ORDER BY oli.id
              LIMIT 1
            ) AS product_name
          FROM vendor_earnings_log vel
          WHERE vel.vendor_id = $1
            AND vel.delivered_at IS NOT NULL
          ORDER BY vel.delivered_at ASC, vel.updated_at ASC
        `,
        [vendorId]
      ),
      pool.query<PayoutRow>(
        `
          SELECT id, net_amount, transaction_id, created_at, order_ids
          FROM vendor_payout
          WHERE vendor_id = $1
            AND lower(coalesce(status, '')) IN ('processed', 'completed', 'paid')
          ORDER BY created_at ASC
        `,
        [vendorId]
      ),
    ])

  const ratesCache = new Map<string, LedgerRates>()
  const ratesFor = async (opts: {
    gstRate: number
    commissionRate: number
    platformRate?: number
    partnerRate?: number
    tcsRate?: number
    tdsRate?: number
  }) => {
    const key = [
      opts.gstRate,
      opts.commissionRate,
      opts.platformRate ?? "live",
      opts.partnerRate ?? "live",
      opts.tcsRate ?? taxRates.tcs_rate,
      opts.tdsRate ?? taxRates.tds_rate,
    ].join(":")
    const cached = ratesCache.get(key)
    if (cached) return cached
    const rates = await buildLedgerRatesForVendor(vendorId, pool, {
      commission_rate: opts.commissionRate,
      tcs_rate: opts.tcsRate ?? taxRates.tcs_rate,
      tds_rate: opts.tdsRate ?? taxRates.tds_rate,
      output_gst_rate: opts.gstRate,
      platform_rate: opts.platformRate,
      partner_rate: opts.partnerRate,
    })
    ratesCache.set(key, rates)
    return rates
  }

  const raw: VendorPaymentSettlement[] = []

  for (const row of historyResult.rows) {
    const gstRate = Number(row.gst_rate) || 18
    const rates = await ratesFor({
      gstRate,
      commissionRate: Number(row.commission_rate) || 0,
      platformRate:
        row.platform_fee_rate == null ? undefined : Number(row.platform_fee_rate),
      partnerRate:
        row.partner_commission_rate == null
          ? undefined
          : Number(row.partner_commission_rate),
      tcsRate: Number(row.tcs_rate) || undefined,
      tdsRate: Number(row.tds_rate) || undefined,
    })
    raw.push(
      ...buildVendorLedgerRowsFromEarning(
        {
          id: row.id,
          order_id: row.order_id,
          order_display_id: row.order_display_id,
          product_name: row.product_name,
          status: row.status,
          taxable_amount: Number(row.taxable_amount) || 0,
          logistic_fee: Number(row.logistic_fee) || 0,
          return_fee: Number(row.return_fee) || 0,
          cancellation_fee: Number(row.cancellation_fee) || 0,
          gst_rate: gstRate,
          gross_amount: Number(row.gross_amount) || 0,
          net_amount: Number(row.net_amount) || 0,
          delivered_at: row.delivered_at,
          unlock_at: row.unlock_at,
        },
        rates,
        taxRates
      )
    )
  }

  const zeroRates = await ratesFor({ gstRate: 18, commissionRate: 0 })
  for (const payout of payoutResult.rows) {
    const paymentRow = buildVendorLedgerRowFromPayout(
      {
        id: payout.id,
        net_amount: Number(payout.net_amount) || 0,
        transaction_id: payout.transaction_id,
        created_at: payout.created_at,
        order_ids: payout.order_ids,
      },
      zeroRates
    )
    if (paymentRow) raw.push(paymentRow)
  }

  attachPayoutReferencesToOrders(raw, payoutResult.rows)

  raw.sort((a, b) => {
    const ta = new Date(a.delivered_at || 0).getTime()
    const tb = new Date(b.delivered_at || 0).getTime()
    return ta - tb
  })

  const settlements = applyRunningLedgerBalance(raw)

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  return {
    cards: summarizeVendorPaymentCards(settlements, {
      todayKey,
      available_balance: summary.available_balance,
      unlocking_balance: summary.unlocking_balance,
      total_withdrawn: summary.total_withdrawn,
    }),
    settlements,
    timezone: "Asia/Kolkata",
    unlock_minutes: VENDOR_EARNINGS_UNLOCK_MINUTES,
    as_of: new Date().toISOString(),
  }
}
