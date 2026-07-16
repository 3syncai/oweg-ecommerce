import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { mountHideSalesChannelColumn } from "../lib/hide-sales-channel-column"

const HideProductsSalesChannelWidget = () => {
  useEffect(() => mountHideSalesChannelColumn(), [])
  return null
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default HideProductsSalesChannelWidget
