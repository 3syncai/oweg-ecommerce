import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import ShiprocketService from "../services/shiprocket"

export default async function shiprocketForwardOrderSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (process.env.SHIPROCKET_AUTO_FORWARD !== "true") {
    console.log(`[Shiprocket] Auto-forward disabled for order ${data.id}`)
    return
  }

  try {
    console.log(`[Shiprocket] Auto-forward enabled for order ${data.id}`)
    const shiprocket = new ShiprocketService()
    const orderModuleService = container.resolve(Modules.ORDER)

    const order = await orderModuleService.retrieveOrder(data.id, {
      relations: ["items", "shipping_address", "billing_address"],
    })
    console.log(`[Shiprocket] Building forward shipment for order ${order.id}`)

    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION
    if (!pickupLocation) {
      throw new Error("SHIPROCKET_PICKUP_LOCATION is required for forward shipments.")
    }

    const defaultLength = Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 10)
    const defaultBreadth = Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 10)
    const defaultHeight = Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10)
    const defaultWeight = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)
    const firstName = order.shipping_address?.first_name || "Customer"
    const lastName = order.shipping_address?.last_name || "Customer"
    const phoneDigits = String(order.shipping_address?.phone || "").replace(/\\D/g, "")
    const billingPhone = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits

    const metadata = order.metadata || {}
    const paymentMethodRaw = String((metadata as any).payment_method || "").toLowerCase()
    const paymentMethod = paymentMethodRaw === "cod" ? "COD" : "Prepaid"

    const payload = {
      order_id: order.id,
      order_date: new Date(order.created_at || Date.now()).toISOString(),
      pickup_location: pickupLocation,
      billing_customer_name: `${firstName} ${lastName}`.trim(),
      billing_first_name: firstName,
      billing_last_name: lastName,
      billing_address: order.shipping_address?.address_1 || "",
      billing_address_2: order.shipping_address?.address_2 || "",
      billing_city: order.shipping_address?.city || "",
      billing_pincode: order.shipping_address?.postal_code || "",
      billing_state: order.shipping_address?.province || "",
      billing_country: order.shipping_address?.country_code || "IN",
      billing_email: order.email || "",
      billing_phone: billingPhone,
      shipping_is_billing: true,
      length: defaultLength,
      breadth: defaultBreadth,
      height: defaultHeight,
      weight: defaultWeight,
      order_items: (order.items || []).map((item: any) => ({
        name: item.title || "Item",
        sku: item.variant_sku || item.id || "SKU",
        units: item.quantity,
        selling_price: item.unit_price || 0,
      })),
      payment_method: paymentMethod,
      sub_total: (order.items || []).reduce((sum: number, item: any) => sum + (item.unit_price || 0) * item.quantity, 0),
    }

    const response = await shiprocket.createForwardShipment(payload as any)
    console.log(`[Shiprocket] Forward shipment created for order ${order.id}`)

    await orderModuleService.updateOrders(order.id, {
      metadata: {
        ...metadata,
        shiprocket_order_id: (response as any)?.order_id || (response as any)?.data?.order_id || null,
        shiprocket_awb: (response as any)?.awb || (response as any)?.data?.awb || null,
        shiprocket_status: "created",
      },
    })
    console.log(`[Shiprocket] Stored Shiprocket IDs for order ${order.id}`)
  } catch (error) {
    console.error("Shiprocket forward shipment failed:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
