import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { markCodOrderAsPaid } from "../../../../../lib/cod-payment"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: "Order id is required." })
  }

  try {
    const result = await markCodOrderAsPaid(id)

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message })
    }

    return res.json({
      success: true,
      order_id: result.orderId,
      paid_total: result.paidTotal,
      payment_status: "captured",
    })
  } catch (error) {
    console.error("[mark-cod-paid] failed:", error)
    return res.status(500).json({
      message: "Failed to mark COD order as paid.",
    })
  }
}
