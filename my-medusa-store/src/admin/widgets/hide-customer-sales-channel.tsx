import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { mountHideSalesChannelColumn } from "../lib/hide-sales-channel-column"

const HideCustomerSalesChannelWidget = () => {
  useEffect(() => mountHideSalesChannelColumn(), [])
  return null
}

export const config = defineWidgetConfig({
  zone: "customer.details.before",
})

export default HideCustomerSalesChannelWidget
