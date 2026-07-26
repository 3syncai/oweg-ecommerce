import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { requireApprovedVendor } from "../../../_lib/guards"
import { generateInvoice } from "../../../../../services/invoice-generator"
import {
  getItemUnitPrice,
  getItemUnits,
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
      return res.status(409).json({ message: "Choose shipping method before generating invoice" })
    }

    const vendorItems = pickVendorItems(result.order, result.vendorProductIds)
    const vendorTotal = vendorItems.reduce(
      (sum, item) => sum + getItemUnitPrice(item) * getItemUnits(item),
      0
    )

    const customerGst = await resolveCustomerGst(
      req,
      (result.order as any).customer_id,
      result.order.email
    )

    const invoiceOrder = {
      ...result.order,
      items: vendorItems,
      subtotal: vendorTotal,
      total: vendorTotal,
      invoice_number: `INV-${result.order.display_id || result.order.id}-${auth.vendor_id.slice(-4)}`,
      customer_gstin: customerGst.gstin,
      customer_business_name: customerGst.business_name,
      payment_type: (result.order as any).payment_type,
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
