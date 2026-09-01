import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { isVendorEasyShipOrder, resolveVendorOwnedReturn } from "../../../../../lib/vendor-return-shiprocket"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * POST /vendor/returns/:id/select-courier
 * Deprecated for Easy Ship — admin books return pickup after approval.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const returnId = req.params?.id as string
  if (!returnId) return res.status(400).json({ message: "Return id is required" })

  try {
    const resolved = await resolveVendorOwnedReturn(req, auth.vendor_id, returnId)
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message })
    }

    const { request, order } = resolved

    if (isVendorEasyShipOrder(order, auth.vendor_id)) {
      return res.status(409).json({
        message:
          "Return pickup is booked by admin after approval. You will see pickup status here once booked.",
        awaiting_admin_booking: String(request.status) === "approved" && !request.shiprocket_awb,
      })
    }

    return res.status(400).json({
      message: "Courier selection is only used for Easy Ship returns (now handled by admin).",
    })
  } catch (error: any) {
    console.error("[Vendor return select-courier] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to save reverse courier",
    })
  }
}
