"use client"

import { clx } from "@medusajs/ui"

export type StatusVariant = "success" | "warning" | "info" | "error" | "neutral"

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-oweg-500 shadow-[0_0_8px_rgba(0,210,106,0.45)]",
  warning: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
  info: "bg-sky-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]",
  error: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
  neutral: "bg-ui-fg-muted shadow-[0_0_6px_rgba(148,163,184,0.3)]",
}

export const fulfillmentStatusVariant = (status?: string): StatusVariant => {
  switch (status) {
    case "delivered":
      return "success"
    case "shipped":
      return "info"
    case "canceled":
      return "error"
    case "pending":
    case "processing":
      return "warning"
    default:
      return "warning"
  }
}

type StatusDotProps = {
  variant?: StatusVariant
  className?: string
}

const StatusDot = ({ variant = "neutral", className }: StatusDotProps) => (
  <span
    className={clx("inline-block h-2 w-2 shrink-0 rounded-full", VARIANT_CLASSES[variant], className)}
    aria-hidden
  />
)

export default StatusDot
