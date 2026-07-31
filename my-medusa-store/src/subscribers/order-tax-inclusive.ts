import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Pool } from "pg"
import {
  allocateDiscountAcrossLines,
  breakdownInclusiveGst,
  parseGstRate,
  resolveOrderGstDiscountRupees,
  summarizeOrderGst,
  type OrderGstLine,
} from "../lib/gst-inclusive"

function moneyFromRaw(raw: any, fallback: any): number {
  if (raw && typeof raw === "object" && raw.value != null) {
    const n = Number(raw.value)
    if (Number.isFinite(n)) return n
  }
  const n = Number(fallback)
  return Number.isFinite(n) ? n : 0
}

function qtyFromRaw(raw: any, fallback: any): number {
  if (raw && typeof raw === "object" && raw.value != null) {
    const n = Number(raw.value)
    if (Number.isFinite(n) && n > 0) return n
  }
  const n = Number(fallback)
  return Number.isFinite(n) && n > 0 ? n : 1
}

async function syncOrderTaxInclusive(orderId: string) {
  if (!process.env.DATABASE_URL) return

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    await client.query(
      `UPDATE order_line_item oli
       SET is_tax_inclusive = true, updated_at = now()
       FROM order_item oi
       WHERE oi.order_id = $1 AND oi.item_id = oli.id AND oi.deleted_at IS NULL`,
      [orderId]
    )

    await client.query(
      `UPDATE order_shipping_method osm
       SET is_tax_inclusive = true, updated_at = now()
       FROM order_shipping os
       WHERE os.order_id = $1 AND os.shipping_method_id = osm.id`,
      [orderId]
    )

    await client.query(
      `UPDATE order_line_item_tax_line t
       SET deleted_at = now(), updated_at = now()
       FROM order_item oi
       WHERE oi.order_id = $1 AND oi.item_id = t.item_id AND t.deleted_at IS NULL`,
      [orderId]
    )

    await client.query(
      `UPDATE order_shipping_method_tax_line t
       SET deleted_at = now(), updated_at = now()
       FROM order_shipping os
       WHERE os.order_id = $1 AND os.shipping_method_id = t.shipping_method_id AND t.deleted_at IS NULL`,
      [orderId]
    )

    // Snapshot vendor GST onto each line + order metadata (display breakdown only)
    const itemsRes = await client.query(
      `SELECT oli.id, oli.product_id, oli.title, oli.quantity, oli.raw_quantity,
              oli.unit_price, oli.raw_unit_price, oli.metadata
       FROM order_line_item oli
       JOIN order_item oi ON oi.item_id = oli.id
       WHERE oi.order_id = $1 AND oi.deleted_at IS NULL`,
      [orderId]
    )

    const productIds = Array.from(
      new Set(
        (itemsRes.rows || [])
          .map((r: any) => r.product_id)
          .filter(Boolean)
      )
    )

    const productMeta = new Map<string, any>()
    if (productIds.length) {
      const productsRes = await client.query(
        `SELECT id, metadata FROM product WHERE id = ANY($1::text[])`,
        [productIds]
      )
      for (const row of productsRes.rows || []) {
        productMeta.set(row.id, row.metadata || {})
      }
    }

    const lines: OrderGstLine[] = []

    const orderRes = await client.query(
      `SELECT metadata FROM "order" WHERE id = $1`,
      [orderId]
    )
    const existingMeta = orderRes.rows?.[0]?.metadata || {}

    let medusaDiscount: number | null = null
    try {
      const summaryRes = await client.query(
        `SELECT totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
        [orderId]
      )
      const totals = summaryRes.rows?.[0]?.totals || {}
      if (totals && typeof totals === "object") {
        medusaDiscount = Number(totals.discount_total)
      }
    } catch {
      medusaDiscount = null
    }

    const discountInfo = resolveOrderGstDiscountRupees(
      existingMeta as Record<string, unknown>,
      medusaDiscount
    )

    const grossAmounts = (itemsRes.rows || []).map((row: any) => {
      const qty = qtyFromRaw(row.raw_quantity, row.quantity)
      const unit = moneyFromRaw(row.raw_unit_price, row.unit_price)
      return unit * qty
    })
    const discountShares = allocateDiscountAcrossLines(
      grossAmounts,
      discountInfo.total
    )

    for (let i = 0; i < (itemsRes.rows || []).length; i++) {
      const row = itemsRes.rows[i]
      const pMeta = row.product_id ? productMeta.get(row.product_id) || {} : {}
      const iMeta = row.metadata || {}
      const taxCode = iMeta.tax_code || pMeta.tax_code || null
      const rate =
        parseGstRate(iMeta.gst_rate) ??
        parseGstRate(iMeta.tax_code) ??
        parseGstRate(pMeta.gst_rate) ??
        parseGstRate(pMeta.tax_code) ??
        0

      const qty = qtyFromRaw(row.raw_quantity, row.quantity)
      const unit = moneyFromRaw(row.raw_unit_price, row.unit_price)
      const grossInclusive = unit * qty
      const discount = discountShares[i] || 0
      const netInclusive = Math.max(0, grossInclusive - discount)
      const breakdown = breakdownInclusiveGst(netInclusive, rate, taxCode)

      lines.push({
        item_id: row.id,
        title: String(row.title || "Item"),
        quantity: qty,
        gross_inclusive: grossInclusive,
        discount,
        ...breakdown,
      })

      const nextMeta = {
        ...iMeta,
        tax_code: taxCode,
        gst_rate: rate,
        gst_inclusive: true,
        gst_discount: discount,
        gst_gross_inclusive: grossInclusive,
        gst_breakdown: breakdown,
      }

      await client.query(
        `UPDATE order_line_item
         SET metadata = $2::jsonb, updated_at = now()
         WHERE id = $1`,
        [row.id, JSON.stringify(nextMeta)]
      )
    }

    const summary = summarizeOrderGst(lines, { discount: discountInfo.total })

    const nextOrderMeta = {
      ...existingMeta,
      gst_inclusive: true,
      gst_inclusive_summary: summary,
      gst_discount: discountInfo,
    }

    await client.query(
      `UPDATE "order"
       SET metadata = $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [orderId, JSON.stringify(nextOrderMeta)]
    )

    await client.query("COMMIT")
    console.log(
      `[TaxInclusive] Order ${orderId}: GST snapshot taxable=${summary.taxable} gst=${summary.gst} discount=${summary.discount}`
    )
  } catch (err) {
    await client.query("ROLLBACK")
    console.error(`[TaxInclusive] Failed for order ${orderId}:`, err)
  } finally {
    client.release()
    await pool.end()
  }
}

export default async function orderTaxInclusiveSubscriber({
  event: { data },
}: SubscriberArgs<{ id: string }>) {
  await syncOrderTaxInclusive(data.id)
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.created"],
}
