import { cancelOrReverseCoinsForOrder } from "@/lib/customer-affiliate-coins"
import { getOrderById } from "@/lib/medusa-admin"
import { internalApiHeaders } from "@/lib/store-customer-auth"
import { reverseEarned } from "@/lib/wallet-ledger"
import { refundCoinSpendForOrder } from "@/lib/wallet-coin-order"

export type OrderCancelWalletSettlementResult = {
  earned_reverse: {
    applied: boolean
    amount: number
    customer_id?: string | null
  }
  spend_refund: unknown
  customer_affiliate: Awaited<ReturnType<typeof cancelOrReverseCoinsForOrder>> | null
}

/**
 * Full wallet settlement for a cancelled order — same work admin cancel's
 * storefront webhook performs:
 * 1) reverse earned wallet coins for the order
 * 2) refund coins spent as payment/discount on the order
 * 3) cancel/reverse customer-affiliate coins
 *
 * Vendor earnings are handled on the Medusa cancel routes, not here.
 */
export async function settleOrderCancellationWallet(params: {
  orderId: string
  event?: string
  reason?: string
}): Promise<OrderCancelWalletSettlementResult> {
  const orderId = String(params.orderId || "").trim()
  const event = params.event || "order.cancelled"
  const reason = params.reason || `Order ${event}`

  let earnedReverse: OrderCancelWalletSettlementResult["earned_reverse"] = {
    applied: false,
    amount: 0,
  }
  try {
    const result = await reverseEarned({
      orderId,
      reason,
    })
    earnedReverse = {
      applied: Boolean(result.applied),
      amount: (result.reversedAmount || 0) / 100,
      customer_id: result.customerId || null,
    }
  } catch (err) {
    console.error("[order-cancel-wallet] earned reverse failed:", err)
  }

  let spendRefund: unknown = null
  try {
    spendRefund = await refundCoinSpendForOrder({
      orderId,
      reason: event === "order.return_approved" ? "return" : "cancelled",
    })

    if (
      !spendRefund ||
      (spendRefund as { message?: string }).message === "No coin spend to refund"
    ) {
      // Legacy promotion-code spend path
      const orderRes = await getOrderById(orderId)
      const orderPayload = orderRes?.data as Record<string, unknown> | null
      const order =
        orderPayload && typeof orderPayload === "object" && "order" in orderPayload
          ? ((orderPayload as Record<string, unknown>).order as Record<string, unknown>)
          : orderPayload

      const customerId =
        order && typeof order === "object"
          ? (order.customer_id as string | undefined)
          : undefined
      const metadata =
        order && typeof order === "object"
          ? (order.metadata as Record<string, unknown> | undefined)
          : undefined
      const discountCode =
        (metadata?.coin_discount_code as string | undefined) ||
        (metadata?.coin_discount as string | undefined) ||
        (metadata?.coin_discount_id as string | undefined)

      if (customerId && discountCode) {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000")
        const refundRes = await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount`, {
          method: "POST",
          headers: internalApiHeaders(),
          body: JSON.stringify({
            customer_id: customerId,
            discount_code: discountCode,
          }),
        })
        spendRefund = await refundRes.json().catch(() => ({ legacy: true }))
      }
    }
  } catch (err) {
    console.error("[order-cancel-wallet] spend refund failed:", err)
  }

  let customerAffiliate: Awaited<
    ReturnType<typeof cancelOrReverseCoinsForOrder>
  > | null = null
  try {
    customerAffiliate = await cancelOrReverseCoinsForOrder(orderId, { event })
  } catch (err) {
    console.error("[order-cancel-wallet] affiliate cancel failed:", err)
  }

  return {
    earned_reverse: earnedReverse,
    spend_refund: spendRefund,
    customer_affiliate: customerAffiliate,
  }
}
