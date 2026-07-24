import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
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
    if (!workflow.invoice_generated_at) {
      return res.status(409).json({ message: "Generate invoice before marking RTD" })
    }

    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      stage: "to_dispatch",
      rtd_at: new Date().toISOString(),
    })

    return res.json({
      order: formatVendorOrder({ ...result.order, metadata }, auth.vendor_id, result.vendorProductIds),
    })
  } catch (error: any) {
    console.error("Vendor order RTD error:", error)
    return res.status(500).json({ message: error?.message || "Failed to mark ready to dispatch" })
  }
}
