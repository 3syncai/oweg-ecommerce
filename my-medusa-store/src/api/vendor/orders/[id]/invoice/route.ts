import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { generateInvoice } from "../../../../../services/invoice-generator"
import {
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
      (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
      0
    )
    const invoiceOrder = {
      ...result.order,
      items: vendorItems,
      subtotal: vendorTotal,
      total: vendorTotal,
    }

    const pdf = await generateInvoice(invoiceOrder)
    await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      invoice_generated_at: new Date().toISOString(),
    })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Invoice-${result.order.display_id || result.order.id}.pdf"`
    )
    return res.status(200).send(pdf)
  } catch (error: any) {
    console.error("Vendor order invoice error:", error)
    return res.status(500).json({ message: error?.message || "Failed to generate invoice" })
  }
}
