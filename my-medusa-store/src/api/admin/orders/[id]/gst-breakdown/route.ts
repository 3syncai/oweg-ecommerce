import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  allocateDiscountAcrossLines,
  breakdownInclusiveGst,
  parseGstRate,
  resolveOrderGstDiscountRupees,
  summarizeOrderGst,
  type OrderGstLine,
} from "../../../../../lib/gst-inclusive"
import { getItemUnits, getItemUnitPrice } from "../../../../../lib/vendor-order-workflow"

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

      return {
        item,
        taxCode,
        rate,
        qty,
        grossInclusive,
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

    return res.json({
      order_id: order.id,
      display_id: order.display_id,
      pricing_mode: "tax_inclusive",
      medusa_tax_total: 0,
      discount: discountInfo,
      summary,
      cached_summary: cached,
    })
  } catch (error: any) {
    console.error("[admin gst-breakdown]", error)
    return res.status(500).json({
      message: error?.message || "Failed to compute GST breakdown",
    })
  }
}
