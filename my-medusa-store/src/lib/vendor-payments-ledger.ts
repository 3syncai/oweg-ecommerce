import type { Pool } from "pg"
import {
  buildLedgerRatesForVendor,
  calculateVendorLedgerSettlement,
  type LedgerRates,
} from "./vendor-ledger-settlement"
import {
  getMarketplaceTaxRates,
} from "./vendor-marketplace-tax"
import {
  fetchVendorCommissionRate,
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
  tcs_rate: string | number
  tds_rate: string | number
  logistic_fee: string | number
  return_fee: string | number
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

export async function buildVendorPaymentsView(
  vendorId: string,
  pool: Pool
): Promise<VendorPaymentsView> {
  await syncVendorEarningsStatuses(pool)
  await repairClaimCreditsWithoutCommission(vendorId, pool)
  await recomputeUnpaidVendorLedger(vendorId, pool)
  const [summary, taxRates, commissionRate, historyResult, payoutResult] =
    await Promise.all([
      getVendorEarningsSummary(vendorId, pool),
      getMarketplaceTaxRates(pool),
      fetchVendorCommissionRate(vendorId, pool),
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
            vel.tcs_rate,
            vel.tds_rate,
            COALESCE(vel.logistic_fee, 0) AS logistic_fee,
            COALESCE(vel.return_fee, 0) AS return_fee,
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
  const ratesFor = async (gstRate: number, storedCommission?: number) => {
    const key = `${gstRate}:${storedCommission ?? commissionRate}`
    const cached = ratesCache.get(key)
    if (cached) return cached
    const rates = await buildLedgerRatesForVendor(vendorId, pool, {
      commission_rate: storedCommission ?? commissionRate,
      tcs_rate: taxRates.tcs_rate,
      tds_rate: taxRates.tds_rate,
      output_gst_rate: gstRate,
    })
    ratesCache.set(key, rates)
    return rates
  }

  const raw: VendorPaymentSettlement[] = []

  for (const row of historyResult.rows) {
    const isClaim = String(row.order_id || "").startsWith("claim:")
    const productName =
      row.product_name?.trim() ||
      formatOrderFallback(row.order_display_id, row.order_id)
    const gstRate = Number(row.gst_rate) || 18
    const rates = await ratesFor(gstRate, Number(row.commission_rate) || undefined)
    const itemPrice = Number(row.taxable_amount) || 0
    const logisticFee = Number(row.logistic_fee) || 0
    const returnFee = Number(row.return_fee) || 0

    if (isClaim) {
      const claimAmount = Math.max(
        Number(row.gross_amount) || 0,
        Number(row.net_amount) || 0,
        itemPrice
      )
      const ledger = calculateVendorLedgerSettlement({
        category: "claim",
        item_price: 0,
        logistic_fee: 0,
        claim_amount: claimAmount,
        rates,
      })
      raw.push(
        settlementFromLedger({
          id: row.id,
          order_id: row.order_id,
          order_display_id: row.order_display_id,
          product_name: "Claim settlement",
          status: row.status,
          delivered_at: row.delivered_at,
          unlock_at: row.unlock_at,
          ledger,
          tcs_rate: taxRates.tcs_rate,
          tds_rate: taxRates.tds_rate,
          gst_rate: 0,
        })
      )
      continue
    }

    const saleLedger = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: itemPrice,
      logistic_fee: logisticFee,
      rates,
    })
    raw.push(
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
      })
    )

    if (row.status === "REVERSED") {
      const returnLedger = calculateVendorLedgerSettlement({
        category: "return",
        item_price: itemPrice,
        logistic_fee: logisticFee,
        reverse_logistic_fee: returnFee,
        rates,
      })
      raw.push(
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
  }

  const zeroRates = await ratesFor(18)
  for (const payout of payoutResult.rows) {
    const amount = Number(payout.net_amount) || 0
    if (amount <= 0) continue
    const ledger = calculateVendorLedgerSettlement({
      category: "payment",
      item_price: 0,
      logistic_fee: 0,
      payment_amount: amount,
      rates: zeroRates,
    })
    const firstOrder =
      Array.isArray(payout.order_ids) && payout.order_ids[0]
        ? String(payout.order_ids[0])
        : `payout:${payout.id}`
    raw.push(
      settlementFromLedger({
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
    )
  }

  raw.sort((a, b) => {
    const ta = new Date(a.delivered_at || 0).getTime()
    const tb = new Date(b.delivered_at || 0).getTime()
    return ta - tb
  })

  let running = 0
  const settlements = raw.map((row) => {
    const delta =
      row.category === "payment"
        ? row.payment
        : row.category === "claim"
          ? row.claim_amount
          : row.bank_settlement - row.reverse_logistic_total - row.cancellation_total
    running = Math.round((running + delta) * 100) / 100
    return { ...row, balance_amount: running }
  })

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  const sales = settlements.filter((row) => row.category === "sale")
  const todaySales = sales.filter((row) => isTodayIst(row.delivered_at || null, todayKey))
  const todayReturns = settlements.filter(
    (row) => row.category === "return" && isTodayIst(row.delivered_at || null, todayKey)
  )

  const sum = (rows: VendorPaymentSettlement[], key: keyof VendorPaymentSettlement) =>
    rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)

  const settlementBalance =
    (Number(summary.available_balance) || 0) + (Number(summary.total_withdrawn) || 0)

  return {
    cards: {
      full_sale: sum(sales, "listing_total"),
      taxes: sum(sales, "listing_gst"),
      lifetime_commission: sum(sales, "commission"),
      lifetime_tcs: Math.abs(sum(sales, "tcs")),
      lifetime_tds: Math.abs(sum(sales, "tds")),
      total_sale:
        sum(todaySales, "listing_total") + sum(todayReturns, "listing_total"),
      gst: sum(todaySales, "listing_gst"),
      commission: Math.abs(sum(todaySales, "commission")),
      tcs: Math.abs(sum(todaySales, "tcs")),
      tds: Math.abs(sum(todaySales, "tds")),
      logistic_fee: Math.abs(sum(todaySales, "logistic_fee")),
      return_fee: Math.abs(sum(todayReturns, "return_fee")),
      platform_fee: Math.abs(sum(sales, "platform_fee")),
      partner_commission: Math.abs(sum(sales, "partner_commission")),
      settlement_balance: settlementBalance,
      balance: Number(summary.available_balance) || 0,
      pending_payment: summary.available_balance,
      unlocking_payment: summary.unlocking_balance,
      withdrawn: summary.total_withdrawn,
    },
    settlements,
    timezone: "Asia/Kolkata",
    unlock_minutes: VENDOR_EARNINGS_UNLOCK_MINUTES,
    as_of: new Date().toISOString(),
  }
}
