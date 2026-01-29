import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
// import { IPaymentModuleService } from "@medusajs/types"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const payload = req.body as any

  console.log("Registering transaction for order:", id, payload)

  try {
    const paymentModule = req.scope.resolve(Modules.PAYMENT)

    // Create a payment record in the Payment Module
    // This acts as the "Transaction" record for the order
    const payment = await paymentModule.createPayment({
      amount: payload.amount,
      currency_code: payload.currency_code,
      provider_id: payload.provider || "razorpay",
      data: {
        ...(payload.metadata || {}),
        order_id: id,
        reference_id: payload.reference,
      },
    })

    console.log("Transaction registered:", payment)

    res.json({ transaction: payment })
  } catch (error: any) {
    console.error("Failed to register transaction:", error)
    res.status(500).json({
      message: "Failed to register transaction",
      error: error.message
    })
  }
}
