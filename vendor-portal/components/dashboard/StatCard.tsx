"use client"

import { ReactNode } from "react"
import { Heading, Text, clx } from "@medusajs/ui"

type StatCardProps = {
  icon: ReactNode
  label: string
  value: string | number
  subtext?: ReactNode
  variant?: "default" | "hero"
  className?: string
  style?: React.CSSProperties
}

const StatCard = ({
  icon,
  label,
  value,
  subtext,
  variant = "default",
  className,
  style,
}: StatCardProps) => {
  const isHero = variant === "hero"

  return (
    <div
      style={style}
      className={clx(
        "group rounded-xl border bg-ui-bg-base p-5 transition-all duration-200",
        "hover:border-ui-border-strong hover:shadow-sm",
        isHero
          ? "border-oweg-500/25 bg-gradient-to-br from-oweg-500/[0.08] via-ui-bg-base to-oweg-50/30 lg:col-span-2 dark:from-oweg-500/[0.12] dark:to-ui-bg-base"
          : "border-ui-border-base/70 oweg-card",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className={clx(
            "flex items-center justify-center rounded-lg p-2 transition-colors",
            isHero
              ? "bg-oweg-500/15 text-oweg-600 dark:text-oweg-400"
              : "bg-oweg-500/10 text-oweg-600 group-hover:text-oweg-700 dark:text-oweg-400 dark:group-hover:text-oweg-300"
          )}
        >
          {icon}
        </div>
        <Text className="text-sm text-ui-fg-subtle">{label}</Text>
      </div>

      <Heading level="h2" className={clx(isHero ? "text-3xl md:text-4xl" : "text-2xl")}>
        {value}
      </Heading>

      {subtext && (
        <div className={clx("mt-2", isHero ? "text-sm" : "text-xs")}>{subtext}</div>
      )}
    </div>
  )
}

export default StatCard
