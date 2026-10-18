import { randomUUID } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { listCatalogOffers } from "../../../../../lib/vendor-offer-routing"
import { withVendorOrderAssignmentLock } from "../../../../../lib/vendor-order-assignment-lock"
import { listReplacementRequests, type ReplacementChoice } from "../../../../../lib/vendor-replacement-requests"
import { sendVendorReplacementRequestEmail } from "../../../../../lib/vendor-replacement-mailer"
import { getVendorVariantOptions } from "../../../../../lib/vendor-variant-options"
import { getVendorRelocationOrder } from "../../../../../lib/vendor-relocation-order"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.params?.id || "")
  if (!(req as any).auth_context?.actor_id) return res.status(401).json({ message: "Admin sign-in required" })
  try {
    return res.json({ requests: await listReplacementRequests(orderId) })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Could not load replacement requests" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.params?.id || "")
  const actorId = String((req as any).auth_context?.actor_id || "")
  const body = (req.body || {}) as Record<string, unknown>
  const itemId = String(body.item_id || "")
  const submitted = Array.isArray(body.options) ? body.options as Array<Record<string, unknown>> : []
  const message = String(body.message || "").trim().slice(0, 500)
  if (!actorId) return res.status(401).json({ message: "Admin sign-in required" })
  if (!orderId || !itemId || !submitted.length || submitted.length > 10)
    return res.status(400).json({ message: "Choose 1–10 replacement options for an order item" })

  try {
    const saved = await withVendorOrderAssignmentLock(orderId, async () => {
      const order: any = await getVendorRelocationOrder(req, orderId)
      if (["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
        throw new Error("The customer order is cancelled")
      if ((order.fulfillments || []).some((fulfillment: any) => !fulfillment.canceled_at))
        throw new Error("The order already has a fulfillment")
      const earnings = await getSharedDbPool().query("SELECT 1 FROM vendor_earnings_log WHERE order_id=$1 LIMIT 1", [orderId])
      if (earnings.rows.length) throw new Error("Vendor settlement already started")
      const item: any = (order.items || []).find((entry: any) => entry.id === itemId)
      if (!item?.variant_id) throw new Error("Order item not found")
      if (!order.customer_id || !order.email) throw new Error("The order has no customer email")
      const quantity = Number(item.quantity)
      const price = Number(item.unit_price)
      const source = await getSharedDbPool().query<{ vendor_id: string }>(
        "SELECT p.metadata->>'vendor_id' AS vendor_id FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=$1",
        [item.variant_id]
      )
      const currentVendorId = source.rows[0]?.vendor_id
      if (!currentVendorId) throw new Error("This item has no current vendor")
      const candidates = (await listCatalogOffers(item.variant_id))
        .filter((offer) => offer.vendor_id !== currentVendorId && offer.available >= quantity)
      const chosen: ReplacementChoice[] = []
      const seen = new Set<string>()
      for (const raw of submitted) {
        const variantId = String(raw.variant_id || "")
        const vendorId = String(raw.vendor_id || "")
        const unitPrice = Number(raw.unit_price)
        const key = variantId
        if (seen.has(key)) continue
        seen.add(key)
        const offer = candidates.find((entry) => entry.variant_id === variantId && entry.vendor_id === vendorId
          && entry.prices.some((amount) => Math.abs(amount - unitPrice) < 0.005))
        if (!offer) throw new Error("A selected vendor, variant, stock level, or price is no longer available")
        chosen.push({
          variant_id: offer.variant_id, product_id: offer.product_id,
          vendor_id: offer.vendor_id, store_name: offer.store_name || offer.vendor_name || "Vendor",
          product_title: offer.product_title || item.title || "Product",
          variant_title: offer.variant_title || "Variant", sku: offer.sku,
          unit_price: unitPrice, available: offer.available, options: {},
        })
      }
      const optionMap = await getVendorVariantOptions(chosen.map((offer) => offer.variant_id))
      for (const offer of chosen) offer.options = optionMap.get(offer.variant_id) || {}
      const id = `vrr_${randomUUID()}`
      const hours = Math.min(168, Math.max(1, Number.parseInt(process.env.VENDOR_REPLACEMENT_RESPONSE_HOURS || "48", 10) || 48))
      const inserted = await getSharedDbPool().query<{ expires_at: string }>(`INSERT INTO vendor_replacement_request
        (id,order_id,item_id,customer_id,customer_email,original_title,original_variant_id,original_unit_price,options,message,created_by,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+$12::int * interval '1 hour') RETURNING expires_at`,
        [id, orderId, itemId, order.customer_id, order.email, item.title || "Product", item.variant_id,
          price, JSON.stringify(chosen), message || null, actorId, hours])
      return { id, order, item, price, options: chosen, expiresAt: inserted.rows[0]?.expires_at }
    })

    let emailSent = false
    let emailError: string | null = null
    try {
      await sendVendorReplacementRequestEmail({
        to: saved.order.email, orderId, displayId: saved.order.display_id,
        originalTitle: saved.item.title || "Product", originalPrice: saved.price,
        options: saved.options, note: message, expiresAt: saved.expiresAt,
      })
      emailSent = true
    } catch (error: any) {
      emailError = error?.message || "Could not send customer email"
      console.error("[vendor-replacement] email failed", error)
    }
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
      email_sent_at=CASE WHEN $2::boolean THEN now() ELSE NULL END,
      email_error=$3, updated_at=now() WHERE id=$1`, [saved.id, emailSent, emailError])
    return res.status(201).json({ request_id: saved.id, email_sent: emailSent, email_error: emailError })
  } catch (error: any) {
    const message = error?.message || "Could not request customer approval"
    return res.status(/duplicate key|no longer available|already|not found|cancelled|settlement/i.test(message) ? 409 : 500).json({ message })
  }
}
