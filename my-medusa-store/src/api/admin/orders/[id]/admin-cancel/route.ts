import { cancelOrderWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import ShiprocketService from "../../../../../services/shiprocket"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { reverseVendorEarningsForOrder } from "../../../../../lib/vendor-earnings"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import VendorModuleService from "../../../../../modules/vendor/service"
import {
  getVendorWorkflows,
  isVendorAccepted,
} from "../../../../../lib/vendor-order-workflow"
import {
  applyAdminCancellationMetadata,
  isOrderCancellableByAdmin,
  readCancellationInfo,
  sanitizeCancelText,
} from "../../../../../lib/order-cancel/metadata"
import {
  sendAdminCancelledCustomerEmail,
  sendAdminCancelledVendorEmail,
} from "../../../../../lib/order-cancel/mailer"

function storefrontBaseUrl() {
  return (
    process.env.STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "")
}

async function notifyStorefrontCancel(orderId: string) {
  const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET
  const internalApiSecret = process.env.INTERNAL_API_SECRET
  const baseUrl = storefrontBaseUrl()
  try {
    await fetch(`${baseUrl}/api/webhooks/order-cancelled`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        event: "order.cancelled",
        data: { id: orderId, status: "canceled" },
      }),
    })
  } catch (error) {
    console.warn("[admin-cancel] storefront cancel webhook skipped:", error)
  }
  try {
    await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalApiSecret ? { "x-internal-api-secret": internalApiSecret } : {}),
      },
      body: JSON.stringify({ order_id: orderId, reason: "cancelled" }),
    })
  } catch (error) {
    console.warn("[admin-cancel] coin refund skipped:", error)
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: ["items"],
  })
  const cancellation = readCancellationInfo(order as any)
  const workflows = getVendorWorkflows((order.metadata || {}) as Record<string, unknown>)
  const pendingVendors = Object.values(workflows).filter((workflow) => !isVendorAccepted(workflow))
  const can_cancel = isOrderCancellableByAdmin(order as any)

  return res.json({
    order_id: order.id,
    display_id: (order as any).display_id,
    status: order.status,
    can_cancel,
    awaiting_vendor: pendingVendors.length > 0 || Object.keys(workflows).length === 0,
    cancellation,
  })
}

async function loadOrderFulfillments(req: MedusaRequest, orderId: string) {
  try {
    const query = req.scope.resolve("query") as {
      graph: (input: Record<string, unknown>) => Promise<{ data?: any[] }>
    }
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "fulfillments.id",
        "fulfillments.canceled_at",
        "fulfillments.delivered_at",
      ],
      filters: { id: orderId },
    })
    const order = data?.[0]
    return Array.isArray(order?.fulfillments) ? order.fulfillments : []
  } catch (error) {
    console.warn("[admin-cancel] fulfillment lookup skipped:", error)
    return []
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  const body = (req.body || {}) as {
    customer_reason?: unknown
    vendor_message?: unknown
    note?: unknown
    reason?: unknown
  }
  const customerReason = sanitizeCancelText(body.customer_reason || body.reason)
  const vendorMessage = sanitizeCancelText(body.vendor_message || body.note)
  if (customerReason.length < 3) {
    return res.status(400).json({ message: "Write the reason to send to the customer." })
  }
  if (vendorMessage.length < 3) {
    return res.status(400).json({ message: "Write the message to send to the vendor." })
  }

  const adminId =
    (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id ||
    null

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address", "billing_address"],
    })
  } catch (error: any) {
    console.error("[admin-cancel] retrieve order failed:", error)
    return res.status(404).json({ message: error?.message || "Order not found" })
  }
  const orderAny = order as any

  if (!isOrderCancellableByAdmin(orderAny)) {
    return res.status(400).json({
      message: "This order cannot be cancelled. It is already cancelled, shipped, or delivered.",
    })
  }

  const metadata = applyAdminCancellationMetadata(
    { ...((order.metadata || {}) as Record<string, unknown>) },
    { customerReason, vendorMessage, adminId, forceAdminSource: true }
  )

  const shiprocketOrderId = metadata.shiprocket_order_id
  if (shiprocketOrderId) {
    try {
      const shiprocket = new ShiprocketService()
      await shiprocket.cancelOrders([String(shiprocketOrderId)])
      metadata.shiprocket_status = "cancelled"
    } catch (error: any) {
      return res.status(400).json({
        message: error?.message || "Shiprocket cancellation failed.",
      })
    }
  }

  const fulfillments = await loadOrderFulfillments(req, order.id)
  for (const fulfillment of fulfillments) {
    const fulfillmentId = fulfillment?.id as string | undefined
    if (!fulfillmentId || fulfillment?.canceled_at || fulfillment?.delivered_at) continue
    try {
      const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT) as {
        cancelFulfillment?: (id: string) => Promise<unknown>
      }
      if (typeof fulfillmentService.cancelFulfillment === "function") {
        await fulfillmentService.cancelFulfillment(fulfillmentId)
      }
    } catch (error) {
      console.warn("[admin-cancel] fulfillment cancel skipped:", fulfillmentId, error)
    }
  }

  try {
    await orderModuleService.updateOrders(order.id, { metadata })
  } catch (error: any) {
    console.error("[admin-cancel] metadata update failed:", error)
    return res.status(500).json({ message: error?.message || "Could not save cancellation note." })
  }

  try {
    await cancelOrderWorkflow(req.scope).run({
      input: {
        order_id: order.id,
        canceled_by: adminId || "admin",
      },
    })
  } catch (error: any) {
    const message = String(error?.message || error || "")
    if (!/already canceled|already cancelled/i.test(message)) {
      console.error("[admin-cancel] cancel workflow failed:", error)
      return res.status(400).json({
        message: message || "Unable to cancel this order.",
      })
    }
  }

  try {
    await orderModuleService.updateOrders(order.id, { metadata })
  } catch (error) {
    console.warn("[admin-cancel] post-cancel metadata refresh skipped:", error)
  }

  try {
    await reverseVendorEarningsForOrder(order.id, getSharedDbPool(), "cancelled")
  } catch (error) {
    console.warn("[admin-cancel] earnings reverse skipped:", error)
  }

  void notifyStorefrontCancel(order.id)

  const mailResults = await sendCancelNotificationEmails(req, orderAny, metadata, {
    customerReason,
    vendorMessage,
    sendCustomer: true,
    sendVendor: true,
  })

  let updated: any = order
  try {
    updated = await orderModuleService.retrieveOrder(order.id)
  } catch {
    updated = { ...order, status: "canceled" }
  }
  return res.json({
    success: true,
    order_id: order.id,
    display_id: orderAny.display_id,
    status: updated.status,
    cancellation: readCancellationInfo(updated as any),
    mail: mailResults,
  })
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  const body = (req.body || {}) as {
    customer_reason?: unknown
    vendor_message?: unknown
    send_customer?: unknown
    send_vendor?: unknown
  }
  const nextCustomerReason = sanitizeCancelText(body.customer_reason)
  const nextVendorMessage = sanitizeCancelText(body.vendor_message)
  const sendCustomer = body.send_customer === true
  const sendVendor = body.send_vendor === true

  if (nextCustomerReason && nextCustomerReason.length < 3) {
    return res.status(400).json({ message: "Customer reason must be at least 3 characters." })
  }
  if (nextVendorMessage && nextVendorMessage.length < 3) {
    return res.status(400).json({ message: "Vendor message must be at least 3 characters." })
  }
  if (!nextCustomerReason && !nextVendorMessage) {
    return res.status(400).json({ message: "Write a customer reason or a vendor message." })
  }

  const adminId =
    (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id ||
    null

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address", "billing_address"],
    })
  } catch (error: any) {
    return res.status(404).json({ message: error?.message || "Order not found" })
  }

  const status = String(order.status || "").toLowerCase()
  if (status !== "canceled" && status !== "cancelled") {
    return res.status(400).json({
      message: "Cancel the order first, then you can send the reason.",
    })
  }

  const existing = readCancellationInfo(order)
  const customerReason = nextCustomerReason || existing.customer_reason || ""
  const vendorMessage = nextVendorMessage || existing.vendor_message || ""
  const metadata = applyAdminCancellationMetadata(
    { ...((order.metadata || {}) as Record<string, unknown>) },
    {
      customerReason,
      vendorMessage,
      adminId,
      keepCancelledAt: true,
      // Message-only edit — never rewrite a customer cancel as admin.
      forceAdminSource: false,
    }
  )

  try {
    await orderModuleService.updateOrders(order.id, { metadata })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Could not save message." })
  }

  const mailResults = await sendCancelNotificationEmails(req, order, metadata, {
    customerReason,
    vendorMessage,
    sendCustomer: sendCustomer && customerReason.length >= 3,
    sendVendor: sendVendor && vendorMessage.length >= 3,
  })
  const updated = await orderModuleService.retrieveOrder(order.id)
  return res.json({
    success: true,
    order_id: order.id,
    display_id: (order as any).display_id,
    status: updated.status,
    cancellation: readCancellationInfo(updated as any),
    mail: mailResults,
  })
}

async function sendCancelNotificationEmails(
  req: MedusaRequest,
  orderAny: any,
  metadata: Record<string, unknown>,
  input: {
    customerReason: string
    vendorMessage: string
    sendCustomer: boolean
    sendVendor: boolean
  }
) {
  const customerEmail =
    (typeof orderAny.email === "string" && orderAny.email) ||
    orderAny.customer?.email ||
    orderAny.shipping_address?.email ||
    null
  const displayId = orderAny.display_id
  const orderUrl = `${storefrontBaseUrl()}/account/orders/${encodeURIComponent(orderAny.id)}`
  const mailResults = {
    customer: { sent: false as boolean },
    vendors: [] as Array<{ email: string; sent: boolean }>,
  }

  if (input.sendCustomer && input.customerReason) {
    try {
      mailResults.customer = await sendAdminCancelledCustomerEmail({
        to: customerEmail,
        displayId,
        orderId: orderAny.id,
        note: input.customerReason,
        orderUrl,
      })
    } catch (error) {
      console.warn("[admin-cancel] customer email failed:", error)
    }
  }

  const workflows = getVendorWorkflows(metadata)
  const vendorIds = Object.keys(workflows)
  if (input.sendVendor && input.vendorMessage && vendorIds.length > 0) {
    const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    for (const vendorId of vendorIds) {
      const workflow = workflows[vendorId]
      let email = workflow.vendor_email || null
      let name = workflow.store_name || workflow.vendor_name || null
      try {
        const vendor = await vendorService.retrieveVendor(vendorId)
        email = email || vendor?.email || null
        name = name || vendor?.store_name || vendor?.name || null
      } catch {
        // Keep workflow email if vendor lookup fails.
      }
      if (!email) continue
      try {
        const result = await sendAdminCancelledVendorEmail({
          to: email,
          displayId,
          orderId: orderAny.id,
          note: input.vendorMessage,
          vendorName: name,
        })
        mailResults.vendors.push({ email, sent: result.sent })
      } catch (error) {
        console.warn("[admin-cancel] vendor email failed:", email, error)
        mailResults.vendors.push({ email, sent: false })
      }
    }
  }

  return mailResults
}
