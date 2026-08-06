import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import { decryptBankDetails } from "../../../../../services/return-bank-crypto"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Order id is required.")
  }

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const order = await orderModuleService.retrieveOrder(orderId)

  const metadata = (order.metadata || {}) as Record<string, unknown>
  const method =
    typeof metadata.cancel_refund_method === "string"
      ? metadata.cancel_refund_method
      : null
  const encrypted =
    typeof metadata.cancel_refund_payout_encrypted === "string"
      ? metadata.cancel_refund_payout_encrypted
      : null
  const upiMasked =
    typeof metadata.cancel_upi_masked === "string"
      ? metadata.cancel_upi_masked
      : null
  const bankLast4 =
    typeof metadata.cancel_bank_last4 === "string"
      ? metadata.cancel_bank_last4
      : null

  if (!encrypted && !method) {
    return res.json({
      cancel_payout: null,
    })
  }

  let payout: Record<string, string> | null = null
  if (encrypted) {
    try {
      payout = decryptBankDetails(encrypted)
    } catch {
      payout = null
    }
  }

  return res.json({
    cancel_payout: {
      method,
      upi_masked: upiMasked,
      bank_last4: bankLast4,
      details: payout,
    },
  })
}
