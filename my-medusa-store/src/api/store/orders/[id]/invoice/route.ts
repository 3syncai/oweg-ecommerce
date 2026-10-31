import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { generateInvoice } from "../../../../../services/invoice-generator"

async function resolveCustomerGst(
  req: MedusaRequest,
  customerId?: string | null
) {
  if (!customerId) {
    return { gstin: null as string | null, business_name: null as string | null }
  }

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    const byCustomer = await pgConnection.raw(
      `SELECT gst_number, business_name
       FROM customer_gst
       WHERE customer_id = ?
         AND gst_number IS NOT NULL
         AND LENGTH(TRIM(gst_number)) >= 10
       ORDER BY created_at DESC
       LIMIT 1`,
      [customerId]
    )
    const row = byCustomer?.rows?.[0]
    if (row?.gst_number) {
      return {
        gstin: String(row.gst_number).trim().toUpperCase(),
        business_name: row.business_name ? String(row.business_name) : null,
      }
    }

    const customer = await pgConnection.raw(
      `SELECT company_name, metadata
       FROM customer
       WHERE id = ?
       LIMIT 1`,
      [customerId]
    )
    const c = customer?.rows?.[0]
    const metaGst =
      c?.metadata?.gst_number ||
      c?.metadata?.gstin ||
      c?.metadata?.gst ||
      null
    if (metaGst && String(metaGst).trim().length >= 10) {
      return {
        gstin: String(metaGst).trim().toUpperCase(),
        business_name: c?.company_name ? String(c.company_name) : null,
      }
    }
    if (c?.company_name) {
      return { gstin: null, business_name: String(c.company_name) }
    }
  } catch (error: any) {
    console.warn("[Customer Invoice] GST lookup failed:", error?.message)
  }

  return { gstin: null as string | null, business_name: null as string | null }
}

/**
 * GET /store/orders/:id/invoice
 * Authenticated customer downloads their order invoice PDF.
 * Discount total includes coupon + OWEG10 + redeemed coins (same as order page).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (
    req as MedusaRequest & { auth_context?: { actor_id?: string } }
  ).auth_context?.actor_id

  if (!customerId) {
    return res.status(401).json({ message: "Customer authentication required" })
  }

  const orderId = String(req.params?.id || "").trim()
  if (!orderId) {
    return res.status(400).json({ message: "Order id is required" })
  }

  try {
    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "status",
        "currency_code",
        "metadata",
        "summary",
        "subtotal",
        "total",
        "discount_total",
        "shipping_total",
        "created_at",
        "customer_id",
        "shipping_address.*",
        "billing_address.*",
        "items.id",
        "items.title",
        "items.quantity",
        "items.raw_quantity",
        "items.detail.quantity",
        "items.detail.raw_quantity",
        "items.unit_price",
        "items.raw_unit_price",
        "items.product_id",
        "items.metadata",
        "items.variant_sku",
        "items.variant.sku",
        "items.variant.product_id",
        "items.variant.product.metadata",
        "items.variant.product.title",
      ],
      filters: { id: orderId },
    })

    const order = data?.[0] as any
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (String(order.customer_id || "") !== String(customerId)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // Enrich line items with product GST metadata for correct taxable breakdown
    const productIds = Array.from(
      new Set(
        (order.items || [])
          .map((item: any) => item.product_id || item.variant?.product_id)
          .filter(Boolean)
      )
    ) as string[]

    const productGstById = new Map<string, { gst_rate: unknown; tax_code: unknown }>()
    if (productIds.length) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "metadata"],
        filters: { id: productIds },
      })
      for (const product of products || []) {
        if (!product?.id) continue
        const pmeta = ((product as any).metadata || {}) as Record<string, unknown>
        productGstById.set(String(product.id), {
          gst_rate: pmeta.gst_rate,
          tax_code: pmeta.tax_code,
        })
      }
    }

    const enrichedItems = (order.items || []).map((item: any) => {
      const productId = String(item.product_id || item.variant?.product_id || "")
      const productGst = productId ? productGstById.get(productId) : null
      const itemMeta = { ...(item.metadata || {}) }
      if ((itemMeta.gst_rate == null || itemMeta.gst_rate === "") && productGst?.gst_rate != null) {
        itemMeta.gst_rate = productGst.gst_rate
      }
      if ((itemMeta.tax_code == null || itemMeta.tax_code === "") && productGst?.tax_code != null) {
        itemMeta.tax_code = productGst.tax_code
      }
      return {
        ...item,
        metadata: itemMeta,
        product: {
          ...(item.product || item.variant?.product || {}),
          metadata: {
            ...(item.product?.metadata || item.variant?.product?.metadata || {}),
            ...(productGst || {}),
          },
        },
      }
    })

    const customerGst = await resolveCustomerGst(req, customerId)

    // Prefer order module totals when graph omitted summary fields
    let shippingTotal = Number(order.shipping_total)
    let discountTotal = Number(order.discount_total)
    let subtotal = Number(order.subtotal)
    let total = Number(order.total)
    try {
      const orderModule = req.scope.resolve(Modules.ORDER) as any
      const full = await orderModule.retrieveOrder(orderId, {
        select: ["id", "subtotal", "total", "discount_total", "shipping_total"],
      })
      if (full) {
        if (!Number.isFinite(shippingTotal) || shippingTotal < 0) {
          shippingTotal = Number(full.shipping_total) || 0
        }
        if (!Number.isFinite(discountTotal)) {
          discountTotal = Number(full.discount_total) || 0
        }
        if (!Number.isFinite(subtotal)) {
          subtotal = Number(full.subtotal) || 0
        }
        if (!Number.isFinite(total)) {
          total = Number(full.total) || 0
        }
      }
    } catch {
      // graph fields are enough for most invoices
    }

    const invoiceOrder = {
      ...order,
      items: enrichedItems,
      subtotal: Number.isFinite(subtotal) ? subtotal : order.subtotal,
      total: Number.isFinite(total) ? total : order.total,
      discount_total: Number.isFinite(discountTotal) ? discountTotal : order.discount_total,
      shipping_total: Number.isFinite(shippingTotal) && shippingTotal >= 0 ? shippingTotal : 0,
      shipping_amount: Number.isFinite(shippingTotal) && shippingTotal >= 0 ? shippingTotal : 0,
      invoice_number: `INV-${order.display_id || order.id}`,
      customer_gstin: customerGst.gstin,
      customer_business_name: customerGst.business_name,
    }

    const pdf = await generateInvoice(invoiceOrder)

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Invoice-OWEG-${order.display_id || order.id}.pdf"`
    )
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).send(Buffer.from(pdf))
  } catch (error: any) {
    console.error("Customer order invoice error:", error)
    return res
      .status(500)
      .json({ message: error?.message || "Failed to generate invoice" })
  }
}
