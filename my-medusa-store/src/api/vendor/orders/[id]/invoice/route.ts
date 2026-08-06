import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { requireApprovedVendor } from "../../../_lib/guards"
import { generateInvoice } from "../../../../../services/invoice-generator"
import { retrieveVendorOrThrow } from "../../../../../lib/vendor-shiprocket-pickup"
import {
  getItemUnitPrice,
  getItemUnits,
  getPaymentType,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  pickVendorItems,
  setVendorOrderCorsHeaders,
  updateVendorOrderWorkflow,
} from "../../../../../lib/vendor-order-workflow"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

async function resolveCustomerGst(
  req: MedusaRequest,
  customerId?: string | null,
  email?: string | null
) {
  if (!customerId && !email) {
    return { gstin: null as string | null, business_name: null as string | null }
  }

  try {
    const pgConnection = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as any

    if (customerId) {
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
    }
  } catch (error: any) {
    console.warn("[Invoice] Customer GST lookup failed:", error?.message)
  }

  return { gstin: null as string | null, business_name: null as string | null }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (!workflow.shipping_method) {
      return res.status(409).json({
        message: "Choose shipping method before generating invoice",
      })
    }

    const vendorItems = pickVendorItems(result.order, result.vendorProductIds)

    // Attach vendor-set product GST (metadata.gst_rate / tax_code) onto line items
    const productIds = Array.from(
      new Set(
        vendorItems
          .map((item: any) => item.product_id || item.variant?.product_id)
          .filter(Boolean)
      )
    ) as string[]
    const productGstById = new Map<string, { gst_rate: unknown; tax_code: unknown }>()
    if (productIds.length) {
      const query = req.scope.resolve("query")
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

    const enrichedItems = vendorItems.map((item: any) => {
      const productId = String(item.product_id || item.variant?.product_id || "")
      const productGst = productId ? productGstById.get(productId) : null
      const itemMeta = { ...(item.metadata || {}) }
      // Prefer line metadata; fall back to vendor product GST settings
      if (itemMeta.gst_rate == null || itemMeta.gst_rate === "") {
        if (productGst?.gst_rate != null && productGst.gst_rate !== "") {
          itemMeta.gst_rate = productGst.gst_rate
        }
      }
      if (itemMeta.tax_code == null || itemMeta.tax_code === "") {
        if (productGst?.tax_code != null && productGst.tax_code !== "") {
          itemMeta.tax_code = productGst.tax_code
        }
      }
      return {
        ...item,
        metadata: itemMeta,
        product: {
          ...(item.product || {}),
          metadata: {
            ...(item.product?.metadata || {}),
            ...(productGst || {}),
          },
        },
      }
    })

    const vendorTotal = enrichedItems.reduce(
      (sum, item) => sum + getItemUnitPrice(item) * getItemUnits(item),
      0
    )

    const customerGst = await resolveCustomerGst(
      req,
      (result.order as any).customer_id,
      result.order.email
    )

    const summary = ((result.order as any).summary || {}) as Record<string, any>
    const meta = ((result.order as any).metadata || {}) as Record<string, any>
    // Customer-facing shipping; free shipping → 0 on invoice (PPT requirement)
    const shippingRaw = [
      (result.order as any).shipping_total,
      (result.order as any).shipping_amount,
      summary.shipping_total,
      summary.original_shipping_total,
      summary.current_shipping_total,
      meta.shipping_total,
      meta.shipping_amount,
    ]
    let shippingTotal = 0
    for (const raw of shippingRaw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) {
        shippingTotal = Math.round(n * 100) / 100
        break
      }
    }

    const vendor = await retrieveVendorOrThrow(req, auth.vendor_id)
    const vendorAddressParts = [
      vendor.store_address,
      [vendor.store_city, vendor.store_pincode].filter(Boolean).join(" - "),
      vendor.store_region,
      vendor.store_country,
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean)

    const invoiceOrder = {
      ...result.order,
      items: enrichedItems,
      subtotal: vendorTotal,
      shipping_total: shippingTotal,
      shipping_amount: shippingTotal,
      total: Math.round((vendorTotal + shippingTotal) * 100) / 100,
      invoice_number: `INV-${result.order.display_id || result.order.id}-${auth.vendor_id.slice(-4)}`,
      customer_gstin: customerGst.gstin,
      customer_business_name: customerGst.business_name,
      payment_type: getPaymentType(result.order as any),
      invoice_seller: {
        brand: "OWEG",
        name: vendor.store_name || vendor.name || "Vendor",
        address: vendorAddressParts.join(", ") || "Address not provided",
        gst: vendor.gst_no || vendor.pan_gst || "Not Provided",
        pan: vendor.pan_no || null,
        show_contact: false,
      },
    }

    const pdf = await generateInvoice(invoiceOrder)
    if (!workflow.invoice_generated_at) {
      await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
        invoice_generated_at: new Date().toISOString(),
      })
    }

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Invoice-OWEG-${result.order.display_id || result.order.id}.pdf"`
    )
    return res.status(200).send(Buffer.from(pdf))
  } catch (error: any) {
    console.error("Vendor order invoice error:", error)
    return res.status(500).json({ message: error?.message || "Failed to generate invoice" })
  }
}
