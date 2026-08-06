import { cancelOrderWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import ShiprocketService from "../../../../../services/shiprocket"
import { encryptBankDetails } from "../../../../../services/return-bank-crypto"

const BLOCKED_SHIPROCKET = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
])

const UPI_REGEX = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i

type RefundPayout =
  | { method: "upi"; upi_id: string }
  | {
      method: "bank"
      account_name: string
      account_number: string
      ifsc_code: string
      bank_name?: string
    }

function isCodOrder(order: any) {
  const metadata = order?.metadata || {}
  const method = String(metadata.payment_method || metadata.payment_type || "").toLowerCase()
  const payment = String(order?.payment_status || "").toLowerCase()
  return method.includes("cod") || method.includes("cash") || payment === "cod"
}

function isPaidOnline(order: any) {
  if (isCodOrder(order)) return false
  const payment = String(order?.payment_status || "").toLowerCase()
  const metadata = order?.metadata || {}
  return (
    payment === "captured" ||
    payment === "paid" ||
    String(metadata.razorpay_payment_status || "").toLowerCase() === "captured"
  )
}

function maskUpi(upiId: string) {
  const [local, domain] = upiId.split("@")
  if (!domain) return "***"
  const visible = local.slice(0, 2)
  return `${visible}***@${domain}`
}

function parseRefundPayout(raw: unknown): RefundPayout | null {
  if (!raw || typeof raw !== "object") return null
  const payout = raw as Record<string, unknown>
  const method = typeof payout.method === "string" ? payout.method : ""

  if (method === "upi") {
    const upi_id = typeof payout.upi_id === "string" ? payout.upi_id.trim() : ""
    if (!UPI_REGEX.test(upi_id)) return null
    return { method: "upi", upi_id }
  }

  if (method === "bank") {
    const account_name =
      typeof payout.account_name === "string" ? payout.account_name.trim() : ""
    const account_number =
      typeof payout.account_number === "string" ? payout.account_number.trim() : ""
    const ifsc_code =
      typeof payout.ifsc_code === "string" ? payout.ifsc_code.trim().toUpperCase() : ""
    const bank_name =
      typeof payout.bank_name === "string" ? payout.bank_name.trim() : undefined

    if (
      !account_name ||
      !/^[0-9]{6,32}$/.test(account_number) ||
      !IFSC_REGEX.test(ifsc_code)
    ) {
      return null
    }

    return {
      method: "bank",
      account_name,
      account_number,
      ifsc_code,
      ...(bank_name ? { bank_name } : {}),
    }
  }

  return null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context

  if (!authContext?.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Customer authentication required.")
  }

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const order = await orderModuleService.retrieveOrder(req.params.id, {
    relations: ["items", "shipping_address", "billing_address"],
  })

  const orderAny = order as any
  const orderCustomerId = order?.customer_id || orderAny?.customer?.id
  if (orderCustomerId !== authContext.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Order does not belong to customer.")
  }

  const metadata = { ...(order.metadata || {}) } as Record<string, unknown>
  const shiprocketStatus = String(metadata.shiprocket_status || "").toLowerCase()
  const fulfillment = String(orderAny?.fulfillment_status || "").toLowerCase()

  if (BLOCKED_SHIPROCKET.has(shiprocketStatus) || fulfillment === "shipped" || fulfillment === "delivered") {
    throw new MedusaError(
      MedusaErrorTypes.NOT_ALLOWED,
      "Order already shipped. Please use return after delivery."
    )
  }

  const body = (req.body || {}) as { reason?: unknown; refund_payout?: unknown }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 180) : ""
  if (reason.length < 3) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Cancellation reason is required.")
  }

  const requiresPayout = isPaidOnline(orderAny)
  const refundPayout = parseRefundPayout(body.refund_payout)

  if (requiresPayout && !refundPayout) {
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      "Provide UPI ID or bank details for the refund."
    )
  }

  if (refundPayout?.method === "upi") {
    metadata.cancel_refund_method = "upi"
    metadata.cancel_refund_payout_encrypted = encryptBankDetails({
      method: "upi",
      upi_id: refundPayout.upi_id,
    })
    metadata.cancel_upi_masked = maskUpi(refundPayout.upi_id)
    delete metadata.cancel_bank_last4
  } else if (refundPayout?.method === "bank") {
    metadata.cancel_refund_method = "bank"
    metadata.cancel_refund_payout_encrypted = encryptBankDetails({
      method: "bank",
      account_name: refundPayout.account_name,
      account_number: refundPayout.account_number,
      ifsc_code: refundPayout.ifsc_code,
      bank_name: refundPayout.bank_name || "",
    })
    metadata.cancel_bank_last4 = refundPayout.account_number.slice(-4)
    delete metadata.cancel_upi_masked
  }

  const shiprocketOrderId = metadata.shiprocket_order_id
  if (shiprocketOrderId) {
    try {
      const shiprocket = new ShiprocketService()
      await shiprocket.cancelOrders([String(shiprocketOrderId)])
      metadata.shiprocket_status = "cancelled"
      await orderModuleService.updateOrders(order.id, {
        metadata,
      })
    } catch (error: any) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        error?.message || "Shiprocket cancellation failed."
      )
    }
  }

  await cancelOrderWorkflow(req.scope).run({
    input: {
      order_id: order.id,
      canceled_by: authContext.actor_id,
    },
  })

  metadata.cancellation_reason = reason
  metadata.cancellation_requested_at = new Date().toISOString()
  metadata.cancellation_requested_by = authContext.actor_id

  await orderModuleService.updateOrders(order.id, {
    metadata,
  })

  return res.json({ success: true })
}
