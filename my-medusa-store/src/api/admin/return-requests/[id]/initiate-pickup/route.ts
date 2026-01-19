import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"
import ShiprocketService from "../../../../../services/shiprocket"

function getReturnWarehouseAddress() {
  const required = [
    "SHIPROCKET_RETURN_NAME",
    "SHIPROCKET_RETURN_PHONE",
    "SHIPROCKET_RETURN_ADDRESS",
    "SHIPROCKET_RETURN_CITY",
    "SHIPROCKET_RETURN_STATE",
    "SHIPROCKET_RETURN_COUNTRY",
    "SHIPROCKET_RETURN_PINCODE",
  ]
  const missing = required.filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Missing Shiprocket return address env: ${missing.join(", ")}`)
  }

  return {
    name: process.env.SHIPROCKET_RETURN_NAME as string,
    phone: process.env.SHIPROCKET_RETURN_PHONE as string,
    address: process.env.SHIPROCKET_RETURN_ADDRESS as string,
    city: process.env.SHIPROCKET_RETURN_CITY as string,
    state: process.env.SHIPROCKET_RETURN_STATE as string,
    country: process.env.SHIPROCKET_RETURN_COUNTRY as string,
    pincode: process.env.SHIPROCKET_RETURN_PINCODE as string,
  }
}

function normalizePhone(value?: string | null) {
  if (!value) return ""
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 10) return digits
  return digits.slice(-10)
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  console.log(`[Return] Initiate pickup requested for ${id}`)
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const shiprocket = new ShiprocketService()
  const body = (req.body || {}) as { reason?: string }

  const requests = await returnService.listReturnRequests({ id })
  if (!requests.length) {
    throw new MedusaError(MedusaErrorTypes.NOT_FOUND, "Return request not found.")
  }
  const request = requests[0]
  if (request.status !== "approved") {
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      "Pickup can only be initiated after approval."
    )
  }
  console.log(`[Return] Found return request ${request.id} for order ${request.order_id}`)

  const order = await orderModuleService.retrieveOrder(request.order_id, {
    relations: ["items", "shipping_address", "billing_address"],
  })
  console.log(`[Return] Loaded order ${order.id} for reverse pickup`)

  const orderItems = order.items || []
  const returnItems = await returnService.listReturnRequestItems({ return_request_id: request.id })
  const warehouse = getReturnWarehouseAddress()
  const firstName = order.shipping_address?.first_name || "Customer"
  const lastName = order.shipping_address?.last_name || "Customer"
  const pickupPhone = normalizePhone(order.shipping_address?.phone || "")
  const reason = body.reason?.trim() || request.reason || ""
  const defaultLength = Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 10)
  const defaultBreadth = Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 10)
  const defaultHeight = Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10)
  const defaultWeight = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)

  const payload = {
    order_id: `return_${request.id}`,
    order_date: new Date().toISOString(),
    pickup_customer_name: `${firstName} ${lastName}`.trim(),
    pickup_first_name: firstName,
    pickup_last_name: lastName,
    pickup_address: order.shipping_address?.address_1 || "",
    pickup_address_2: order.shipping_address?.address_2 || "",
    pickup_city: order.shipping_address?.city || "",
    pickup_state: order.shipping_address?.province || "",
    pickup_country: order.shipping_address?.country_code || "IN",
    pickup_pincode: order.shipping_address?.postal_code || "",
    pickup_email: order.email || "",
    pickup_phone: pickupPhone,
    shipping_is_billing: true,
    shipping_customer_name: warehouse.name,
    shipping_address: warehouse.address,
    shipping_city: warehouse.city,
    shipping_state: warehouse.state,
    shipping_country: warehouse.country,
    shipping_pincode: warehouse.pincode,
    shipping_phone: warehouse.phone,
    length: defaultLength,
    breadth: defaultBreadth,
    height: defaultHeight,
    weight: defaultWeight,
    order_items: returnItems.map((item: any) => {
      const original = orderItems.find((orderItem: any) => orderItem.id === item.order_item_id)
      return {
        name: original?.title || "Return Item",
        sku: original?.sku || original?.id || "SKU",
        units: item.quantity,
        selling_price: original?.unit_price || 0,
      }
    }),
    payment_method: "Prepaid",
    sub_total: returnItems.reduce((sum: number, item: any) => {
      const original = orderItems.find((orderItem: any) => orderItem.id === item.order_item_id)
      return sum + (original?.unit_price || 0) * item.quantity
    }, 0),
    ...(reason ? { reason } : {}),
  }

  console.log(`[Return] Calling Shiprocket reverse pickup for return ${request.id}`)
  let response: any
  try {
    response = await shiprocket.createReversePickup(payload as any)
    console.log(`[Return] Shiprocket reverse pickup created for return ${request.id}`)
  } catch (error: any) {
    console.error("[Return] Shiprocket reverse pickup failed", error?.message || error)
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      error?.message || "Shiprocket reverse pickup failed."
    )
  }

  const shiprocketOrderIdRaw = (response as any)?.order_id || (response as any)?.data?.order_id || null
  const shiprocketAwbRaw = (response as any)?.awb || (response as any)?.data?.awb || null
  const shiprocketOrderId = shiprocketOrderIdRaw !== null && shiprocketOrderIdRaw !== undefined
    ? String(shiprocketOrderIdRaw)
    : null
  const shiprocketAwb = shiprocketAwbRaw !== null && shiprocketAwbRaw !== undefined
    ? String(shiprocketAwbRaw)
    : null

  const updated = await returnService.updateReturnRequests({
    id: request.id,
    shiprocket_order_id: shiprocketOrderId,
    shiprocket_awb: shiprocketAwb,
    shiprocket_status: "pickup_initiated",
  })

  await returnService.markPickupInitiated(request.id)
  console.log(`[Return] Marked pickup initiated for ${request.id}`)

  return res.json({ return_request: updated, shiprocket: response })
}
