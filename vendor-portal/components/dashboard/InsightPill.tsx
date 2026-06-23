"use client"

import Link from "next/link"
import { Text, clx } from "@medusajs/ui"
import { ArrowUpRightMini } from "@medusajs/icons"
import StatusDot, { type StatusVariant } from "./StatusDot"

type InsightPillProps = {
  href: string
  message: string
  variant: StatusVariant
  style?: React.CSSProperties
}

const PILL_STYLES: Record<StatusVariant, string> = {
  success:
    "border-oweg-500/25 bg-oweg-500/[0.08] hover:border-oweg-500/40 hover:bg-oweg-500/12",
  warning:
    "border-amber-500/25 bg-amber-500/[0.06] hover:border-amber-500/40 hover:bg-amber-500/10",
  info: "border-sky-500/20 bg-sky-500/[0.06] hover:border-sky-500/35 hover:bg-sky-500/10",
  error: "border-red-500/20 bg-red-500/[0.06] hover:border-red-500/35 hover:bg-red-500/10",
  neutral:
    "border-ui-border-base bg-ui-bg-subtle/40 hover:border-ui-border-strong hover:bg-ui-bg-subtle/70",
}

const InsightPill = ({ href, message, variant, style }: InsightPillProps) => (
  <Link
    href={href}
    style={style}
    className={clx(
      "group inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-full border px-4 py-2.5",
      "transition-all duration-200 sm:flex-initial sm:min-w-[200px]",
      PILL_STYLES[variant]
    )}
  >
    <StatusDot variant={variant} />
    <Text size="small" className="truncate font-medium text-ui-fg-base">
      {message}
    </Text>
    <ArrowUpRightMini className="ml-auto shrink-0 text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ui-fg-base" />
  </Link>
)

export default InsightPill
