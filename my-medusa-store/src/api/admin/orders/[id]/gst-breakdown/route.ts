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
import { getItemUnits, getItemUnitPrice } from "../../../../../lib/vendor-order-workflow"
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../../lib/vendor-commission"
import {
  calculateMarketplaceSettlementFromLines,
  getMarketplaceTaxRates,
} from "../../../../../lib/vendor-marketplace-tax"

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

        let commissionRate = globalCommission
        let vendorLabel: string | null = null

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
            commissionRate = resolveVendorCommissionRate(
              {
                commission_rate:
                  vendor.commission_rate == null
                    ? null
                    : Number(vendor.commission_rate),
                commission_override: vendor.commission_override === true,
              },
              globalCommission
            ).rate
          }
        }

        const settlementLines = prepared.map((row, index) => {
          const discount = discountShares[index] || 0
          return {
            inclusive_amount: Math.max(0, row.grossInclusive - discount),
            gst_rate: row.rate,
          }
        })

        const settlement = calculateMarketplaceSettlementFromLines(
          settlementLines,
          {
            commission_rate: commissionRate,
            tcs_rate: taxRates.tcs_rate,
            tds_rate: taxRates.tds_rate,
          }
        )

        vendor_settlement = {
          ...settlement,
          vendor_id: primaryVendorId,
          vendor_name: vendorLabel,
          vendor_count: vendorIds.length,
          note:
            "Vendor payout deductions on taxable value (Amazon/Flipkart style). Not added to the customer total.",
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
      cached_summary: cached,
    })
  } catch (error: any) {
    console.error("[admin gst-breakdown]", error)
    return res.status(500).json({
      message: error?.message || "Failed to compute GST breakdown",
    })
  }
}
