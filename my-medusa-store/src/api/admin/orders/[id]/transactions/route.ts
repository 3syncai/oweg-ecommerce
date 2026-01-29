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

    // 1. Create Payment Collection
    // We create a container for the payment
    const paymentCollection = await paymentModule.createPaymentCollections({
      currency_code: payload.currency_code,
      amount: payload.amount,
      // We can map this to the order via metadata if needed, usually the link is created via RemoteLink separately
      // metadata: { order_id: id } 
    })

    // 2. Create Payment Session
    // We create a session for the specific provider (e.g. razorpay/manual)
    const paymentSession = await paymentModule.createPaymentSession(
      paymentCollection.id,
      {
        provider_id: payload.provider || "razorpay", // Default to razorpay if not provided
        currency_code: payload.currency_code,
        amount: payload.amount,
        data: {
          ...(payload.metadata || {}),
          order_id: id,
          reference_id: payload.reference,
        },
      }
    )

    // 3. Authorize Payment Session
    // This converts the session into a "Payment" (Authorized state)
    // For manual transactions, we assume it's already done, so we authorize immediately.
    const payment = await paymentModule.authorizePaymentSession(
      paymentSession.id,
      {}
    )

    console.log("Transaction registered (Payment Created):", payment)

    res.json({ transaction: payment })
  } catch (error: any) {
    console.error("Failed to register transaction:", error)
    res.status(500).json({
      message: "Failed to register transaction",
      error: error.message
    })
  }
}
