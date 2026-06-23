"use client"

import { ReactNode } from "react"
import { Text, clx } from "@medusajs/ui"

type GuideCardAccent = "oweg" | "blue" | "green" | "purple" | "orange" | "neutral"

const ACCENT_STYLES: Record<
  GuideCardAccent,
  { ring: string; icon: string }
> = {
  oweg: {
    ring: "border-oweg-500/20 bg-oweg-500/[0.05]",
    icon: "bg-oweg-500/12 text-oweg-600 ring-oweg-500/25 dark:text-oweg-400",
  },
  blue: {
    ring: "border-blue-500/15 bg-blue-500/[0.04]",
    icon: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  },
  green: {
    ring: "border-oweg-500/15 bg-oweg-500/[0.04]",
    icon: "bg-oweg-500/10 text-oweg-600 ring-oweg-500/20 dark:text-oweg-400",
  },
  purple: {
    ring: "border-purple-500/15 bg-purple-500/[0.04]",
    icon: "bg-purple-500/10 text-purple-500 ring-purple-500/20",
  },
  orange: {
    ring: "border-orange-500/15 bg-orange-500/[0.04]",
    icon: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  },
  neutral: {
    ring: "border-ui-border-base/70 bg-ui-bg-base",
    icon: "bg-ui-bg-base-hover text-ui-fg-muted ring-ui-border-base",
  },
}

type GuideCardProps = {
  icon: ReactNode
  title: string
  accent?: GuideCardAccent
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

const GuideCard = ({
  icon,
  title,
  accent = "neutral",
  children,
  className,
  style,
}: GuideCardProps) => {
  const styles = ACCENT_STYLES[accent]

  return (
    <div
      style={style}
      className={clx(
        "rounded-xl border p-5 md:p-6 space-y-3 transition-all duration-200",
        styles.ring,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
            styles.icon
          )}
        >
          {icon}
        </div>
        <Text weight="plus" className="pt-2 text-ui-fg-base">
          {title}
        </Text>
      </div>
      <div className="space-y-2 pl-0 md:pl-[52px]">{children}</div>
    </div>
  )
}

export default GuideCard
