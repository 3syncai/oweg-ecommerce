"use client"

import { Text } from "@medusajs/ui"
import StatusDot, { type StatusVariant } from "./StatusDot"

type ProductStatusProps = {
  status: string
}

const getProductStatusConfig = (
  status: string
): { variant: StatusVariant; label: string; muted?: boolean } => {
  const lowerStatus = status.toLowerCase()

  if (lowerStatus === "pending") {
    return { variant: "warning", label: "Pending approval" }
  }
  if (lowerStatus === "published") {
    return { variant: "success", label: "Published" }
  }
  if (lowerStatus === "rejected") {
    return { variant: "error", label: "Rejected" }
  }
  return { variant: "neutral", label: "Draft", muted: true }
}

export const resolveProductStatus = (product: {
  status: string
  metadata?: { approval_status?: string }
}) => {
  if (product.metadata?.approval_status === "pending") return "pending"
  if (product.metadata?.approval_status === "rejected") return "rejected"
  if (product.status === "published") return "published"
  return "draft"
}

const ProductStatus = ({ status }: ProductStatusProps) => {
  const config = getProductStatusConfig(status)

  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot variant={config.variant} />
      <Text
        size="small"
        className={config.muted ? "text-ui-fg-subtle" : "text-ui-fg-base"}
      >
        {config.label}
      </Text>
    </span>
  )
}

export default ProductStatus
