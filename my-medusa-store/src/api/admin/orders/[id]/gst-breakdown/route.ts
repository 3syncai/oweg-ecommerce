import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import {
  allocateDiscountAcrossLines,
  breakdownInclusiveGst,
  parseGstRate,
  resolveOrderGstDiscountRupees,
  summarizeOrderGst,
  type OrderGstLine,
} from "../../../../../lib/gst-inclusive"
import {
  getItemUnits,
  getItemUnitPrice,
  getVendorWorkflow,
} from "../../../../../lib/vendor-order-workflow"
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../../lib/vendor-commission"
import { getMarketplaceTaxRates } from "../../../../../lib/vendor-marketplace-tax"
import {
  buildLedgerRatesForVendor,
  calculateVendorLedgerSettlement,
} from "../../../../../lib/vendor-ledger-settlement"
import {
  readOrderSettlementRates,
  resolveLiveSettlementRates,
} from "../../../../../lib/vendor-settlement-snapshot"

type PartnerSaleInfo = {
  code: string
  name: string | null
  email: string | null
  commission_amount: number
  commission_rate: number | null
  status: string | null
  source: "commission_log" | "customer_referral" | "order_metadata"
}

async function resolvePartnerName(
  pool: Pool,
  code: string,
  affiliateUserId?: string | null
): Promise<{ name: string | null; email: string | null }> {
  if (affiliateUserId) {
    const byId = await pool.query<{
      first_name: string | null
      last_name: string | null
      email: string | null
    }>(
      `SELECT first_name, last_name, email FROM affiliate_user WHERE id = $1 LIMIT 1`,
      [affiliateUserId]
    )
    const row = byId.rows[0]
    if (row) {
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
      return { name: name || null, email: row.email || null }
    }
  }

  const byCode = await pool.query<{
    first_name: string | null
    last_name: string | null
    email: string | null
  }>(
    `SELECT first_name, last_name, email FROM affiliate_user
     WHERE UPPER(TRIM(refer_code)) = UPPER(TRIM($1)) LIMIT 1`,
    [code]
  )
  if (byCode.rows[0]) {
    const row = byCode.rows[0]
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
    return { name: name || null, email: row.email || null }
  }

  // Partner Admin / branch admin codes
  try {
    const branch = await pool.query<{
      first_name: string | null
      last_name: string | null
    }>(
      `SELECT first_name, last_name FROM branch_admin
       WHERE UPPER(TRIM(refer_code)) = UPPER(TRIM($1))
       LIMIT 1`,
      [code]
    )
    if (branch.rows[0]) {
      const row = branch.rows[0]
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
      return { name: name || null, email: null }
    }
  } catch {
    // branch_admin may not exist
  }

  return { name: null, email: null }
}

async function resolvePartnerSaleForOrder(
  pool: Pool,
  orderId: string,
  customerId: string | null,
  orderMetadata: Record<string, unknown> | null
): Promise<PartnerSaleInfo | null> {
  // 1) Commission already logged for this order
  try {
    const log = await pool.query<{
      affiliate_code: string
      affiliate_user_id: string | null
      commission_amount: string | number | null
      commission_rate: string | number | null
      status: string | null
    }>(
      `SELECT
         affiliate_code,
         MAX(affiliate_user_id) AS affiliate_user_id,
         COALESCE(SUM(commission_amount), 0) AS commission_amount,
         MAX(commission_rate) AS commission_rate,
         MAX(status) AS status
       FROM affiliate_commission_log
       WHERE order_id = $1
       GROUP BY affiliate_code
       ORDER BY COALESCE(SUM(commission_amount), 0) DESC
       LIMIT 1`,
      [orderId]
    )
    const row = log.rows[0]
    if (row?.affiliate_code) {
      const identity = await resolvePartnerName(
        pool,
        row.affiliate_code,
        row.affiliate_user_id
      )
      return {
        code: String(row.affiliate_code).trim(),
        name: identity.name,
        email: identity.email,
        commission_amount: Number(row.commission_amount) || 0,
        commission_rate:
          row.commission_rate == null ? null : Number(row.commission_rate),
        status: row.status || null,
        source: "commission_log",
      }
    }
  } catch {
    // table may not exist in some envs
  }

  // 2) Customer locked referral
  let code: string | null = null
  let source: PartnerSaleInfo["source"] = "customer_referral"
  if (customerId) {
    try {
      const ref = await pool.query<{ referral_code: string | null }>(
        `SELECT referral_code FROM customer_referral WHERE customer_id = $1 LIMIT 1`,
        [customerId]
      )
      code = ref.rows[0]?.referral_code?.trim() || null
    } catch {
      // ignore
    }
  }

  // 3) Order metadata fallback
  if (!code && orderMetadata) {
    const metaCode =
      (typeof orderMetadata.affiliate_code === "string" &&
        orderMetadata.affiliate_code.trim()) ||
      (typeof orderMetadata.referral_code === "string" &&
        orderMetadata.referral_code.trim()) ||
      (typeof orderMetadata.partner_code === "string" &&
        orderMetadata.partner_code.trim()) ||
      null
    if (metaCode) {
      code = metaCode
      source = "order_metadata"
    }
  }

  if (!code) return null

  const identity = await resolvePartnerName(pool, code, null)
  return {
    code,
    name: identity.name,
    email: identity.email,
    commission_amount: 0,
    commission_rate: null,
    status: null,
    source,
  }
}

/**
 * GET /admin/orders/:id/gst-breakdown
 * Shows GST included in line prices (from vendor tax_code / gst_rate).
 * Coin / promo discounts reduce the inclusive base before GST is split.
 * Does not change Medusa tax_total (kept 0 for tax-inclusive pricing).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderId = req.params?.id as string
    if (!orderId) {
      return res.status(400).json({ message: "Order id is required" })
    }

    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "customer_id",
        "metadata",
        "discount_total",
        "summary.discount_total",
        "items.id",
        "items.title",
        "items.quantity",
        "items.raw_quantity",
        "items.unit_price",
        "items.raw_unit_price",
        "items.product_id",
        "items.variant.product_id",
        "items.metadata",
        "items.detail.quantity",
        "items.detail.raw_quantity",
      ],
      filters: { id: orderId },
    })

    const order = data?.[0]
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const items = Array.isArray(order.items) ? order.items : []
    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => item.product_id || item.variant?.product_id)
          .filter(Boolean)
      )
    ) as string[]

    const productById = new Map<string, any>()
    if (productIds.length) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "metadata"],
        filters: { id: productIds },
      })
      for (const product of products || []) {
        if (product?.id) productById.set(product.id, product)
      }
    }

    const prepared = items.map((item: any) => {
      const productId = item.product_id || item.variant?.product_id
      const product = productId ? productById.get(productId) : null
      const itemMeta = item.metadata || {}
      const productMeta = product?.metadata || {}

      const taxCode =
        itemMeta.tax_code ||
        productMeta.tax_code ||
        null
      const rate =
        parseGstRate(itemMeta.gst_rate) ??
        parseGstRate(itemMeta.tax_code) ??
        parseGstRate(productMeta.gst_rate) ??
        parseGstRate(productMeta.tax_code) ??
        0

      const qty = getItemUnits(item)
      const unit = getItemUnitPrice(item)
      const grossInclusive = unit * qty
      const vendorId = String(productMeta.vendor_id || "").trim() || null

      return {
        item,
        taxCode,
        rate,
        qty,
        grossInclusive,
        vendorId,
      }
    })

    const discountInfo = resolveOrderGstDiscountRupees(
      (order.metadata || {}) as Record<string, unknown>,
      (order as any).discount_total ?? (order as any).summary?.discount_total
    )
    const discountShares = allocateDiscountAcrossLines(
      prepared.map((row) => row.grossInclusive),
      discountInfo.total
    )

    const lines: OrderGstLine[] = prepared.map((row, index) => {
      const discount = discountShares[index] || 0
      const netInclusive = Math.max(0, row.grossInclusive - discount)
      const breakdown = breakdownInclusiveGst(netInclusive, row.rate, row.taxCode)

      return {
        item_id: row.item.id,
        title: String(row.item.title || "Item"),
        quantity: row.qty,
        gross_inclusive: row.grossInclusive,
        discount,
        ...breakdown,
      }
    })

    const summary = summarizeOrderGst(lines, { discount: discountInfo.total })
    const cached = (order.metadata as any)?.gst_inclusive_summary || null

    // Marketplace vendor settlement preview (TCS/TDS) — not charged to the customer.
    let vendor_settlement: Record<string, unknown> | null = null
    let partner_sale: PartnerSaleInfo | null = null
    const pool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL })
      : null

    try {
      if (pool) {
        const vendorIds = Array.from(
          new Set(prepared.map((row) => row.vendorId).filter(Boolean) as string[])
        )
        const primaryVendorId = vendorIds[0] || null
        const taxRates = await getMarketplaceTaxRates(pool)
        const globalCommission = await getVendorCommissionDefaultRate(pool)
        const orderMeta = (order.metadata || {}) as Record<string, unknown>

        let commissionRate = globalCommission
        let platformRate: number | undefined
        let partnerRateOverride: number | undefined
        let serviceGstRate: number | undefined
        let tcsRate = taxRates.tcs_rate
        let tdsRate = taxRates.tds_rate
        let vendorLabel: string | null = null
        let rateSource: "snapshot" | "live" = "live"

        if (primaryVendorId) {
          const vendorResult = await pool.query<{
            name: string | null
            store_name: string | null
            commission_rate: string | number | null
            commission_override: boolean | null
          }>(
            `SELECT name, store_name, commission_rate, commission_override
             FROM vendor WHERE id = $1 LIMIT 1`,
            [primaryVendorId]
          )
          const vendor = vendorResult.rows[0]
          if (vendor) {
            vendorLabel = vendor.store_name || vendor.name || primaryVendorId
          }

          // Prefer rates frozen on the order at place/accept — not today's live %
          const snap = readOrderSettlementRates(orderMeta, primaryVendorId)
          if (snap) {
            rateSource = "snapshot"
            commissionRate = snap.commission_rate
            platformRate = snap.platform_fee_rate
            partnerRateOverride = snap.partner_rate
            serviceGstRate = snap.service_gst_rate
            tcsRate = snap.tcs_rate
            tdsRate = snap.tds_rate
          } else {
            const live = await resolveLiveSettlementRates(primaryVendorId, pool)
            commissionRate = live.commission_rate
            platformRate = live.platform_fee_rate
            partnerRateOverride = live.partner_rate
            serviceGstRate = live.service_gst_rate
            tcsRate = live.tcs_rate
            tdsRate = live.tds_rate
            // Fallback if live helper unavailable for this vendor
            if (!Number.isFinite(commissionRate)) {
              commissionRate = resolveVendorCommissionRate(
                {
                  commission_rate:
                    vendor?.commission_rate == null
                      ? null
                      : Number(vendor.commission_rate),
                  commission_override: vendor?.commission_override === true,
                },
                globalCommission
              ).rate
            }
          }
        }

        partner_sale = await resolvePartnerSaleForOrder(
          pool,
          orderId,
          typeof (order as any).customer_id === "string"
            ? (order as any).customer_id
            : null,
          orderMeta
        )

        // Sheet4 bank settlement — same engine as vendor Payments ledger
        const taxableAmount = Number(summary.taxable) || 0
        const outputGstRate =
          Array.from(
            new Set(
              prepared.map((row) => Number(row.rate) || 0).filter((r) => r > 0)
            )
          ).length === 1
            ? Number(prepared.find((row) => Number(row.rate) > 0)?.rate) || 12
            : Number(summary.gst) > 0 && taxableAmount > 0
              ? Math.round((Number(summary.gst) / taxableAmount) * 10000) / 100
              : 12

        const workflow = primaryVendorId
          ? getVendorWorkflow(orderMeta, primaryVendorId)
          : null
        const logisticFee =
          workflow?.shipping_method === "easy"
            ? Number(workflow.easy_courier_rate) || 0
            : 0

        const rates = primaryVendorId
          ? await buildLedgerRatesForVendor(primaryVendorId, pool, {
              commission_rate: commissionRate,
              tcs_rate: tcsRate,
              tds_rate: tdsRate,
              output_gst_rate: outputGstRate,
              platform_rate: platformRate,
              service_gst_rate: serviceGstRate,
              // Partner fee only when this order is a partner-attributed sale
              partner_rate: partner_sale
                ? partnerRateOverride
                : 0,
            })
          : {
              platform_rate: platformRate ?? 5,
              commission_rate: commissionRate,
              partner_rate: partner_sale ? partnerRateOverride ?? 11 : 0,
              output_gst_rate: outputGstRate,
              service_gst_rate: serviceGstRate ?? 18,
              tcs_rate: tcsRate,
              tds_rate: tdsRate,
            }

        const ledger = calculateVendorLedgerSettlement({
          category: "sale",
          item_price: taxableAmount,
          logistic_fee: logisticFee,
          rates,
        })

        vendor_settlement = {
          taxable_amount: taxableAmount,
          // Product catalog inclusive — never Sheet4 C (A+B+GST) which includes logistics
          inclusive_amount:
            Number(summary.inclusive) || ledger.product_total || taxableAmount,
          gst_amount: Number(summary.gst) || ledger.product_gst,
          gst_rate: outputGstRate,
          commission_rate: ledger.commission_rate,
          commission_amount: ledger.commission_total,
          commission_fee: ledger.commission_fee,
          commission_gst: ledger.commission_gst,
          platform_rate: ledger.platform_rate,
          platform_amount: ledger.platform_total,
          platform_fee: ledger.platform_fee,
          platform_gst: ledger.platform_gst,
          partner_rate: ledger.partner_rate,
          partner_amount: ledger.partner_total,
          partner_fee: ledger.partner_commission,
          partner_gst: ledger.partner_gst,
          partner_name: partner_sale
            ? partner_sale.name || partner_sale.code
            : null,
          tcs_rate: rates.tcs_rate,
          tcs_amount: ledger.tcs,
          tds_rate: rates.tds_rate,
          tds_amount: ledger.tds,
          logistic_fee: ledger.logistic_fee,
          logistic_amount: ledger.logistic_total,
          listing_total: ledger.listing_total,
          net_amount: Math.max(0, ledger.bank_settlement),
          bank_settlement: ledger.bank_settlement,
          vendor_id: primaryVendorId,
          vendor_name: vendorLabel,
          vendor_count: vendorIds.length,
          rate_source: rateSource,
          note:
            rateSource === "snapshot"
              ? "Sheet4 bank settlement using rates frozen on this order (not today's live commission)."
              : "Sheet4 bank settlement using live rates (no frozen snapshot on this order).",
        }
      }
    } catch (settlementError) {
      console.warn("[admin gst-breakdown] vendor settlement skipped:", settlementError)
    } finally {
      await pool?.end().catch(() => {})
    }

    return res.json({
      order_id: order.id,
      display_id: order.display_id,
      pricing_mode: "tax_inclusive",
      medusa_tax_total: 0,
      discount: discountInfo,
      summary,
      vendor_settlement,
      partner_sale,
      cached_summary: cached,
    })
  } catch (error: any) {
    console.error("[admin gst-breakdown]", error)
    return res.status(500).json({
      message: error?.message || "Failed to compute GST breakdown",
    })
  }
}
