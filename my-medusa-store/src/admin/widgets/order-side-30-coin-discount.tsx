import { defineWidgetConfig } from "@medusajs/admin-sdk"

/**
 * Coin discount now lives inside the Summary card (via GST tax-total patch).
 * Keep the widget registered so Vite HMR doesn't leave a stale chunk, but
 * render nothing in the side rail.
 */
const OrderCoinDiscountWidget = () => null

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderCoinDiscountWidget
