import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { mountHideSalesChannelColumn } from "../lib/hide-sales-channel-column"

const HideOrdersSalesChannelWidget = () => {
  useEffect(() => mountHideSalesChannelColumn(), [])
  return null
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default HideOrdersSalesChannelWidget
