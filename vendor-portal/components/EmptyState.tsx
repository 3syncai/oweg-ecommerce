"use client"

import { ReactNode } from "react"
import { Button, Heading, Text } from "@medusajs/ui"

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description?: string
  /** Soft accent color around the icon ring (tailwind base, e.g. "blue", "orange") */
  accent?: "oweg" | "blue" | "green" | "orange" | "purple" | "gray"
  primaryAction?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

const ACCENT_RING: Record<NonNullable<EmptyStateProps["accent"]>, string> = {
  oweg: "bg-oweg-500/10 text-oweg-600 ring-oweg-500/25 dark:text-oweg-400",
  blue: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  green: "bg-oweg-500/10 text-oweg-600 ring-oweg-500/20 dark:text-oweg-400",
  orange: "bg-orange-500/10 text-orange-500 ring-orange-500/20",
  purple: "bg-purple-500/10 text-purple-500 ring-purple-500/20",
  gray: "bg-ui-bg-base-hover text-ui-fg-muted ring-ui-border-base",
}

const EmptyState = ({
  icon,
  title,
  description,
  accent = "gray",
  primaryAction,
  secondaryAction,
}: EmptyStateProps) => {
  const ringClass = ACCENT_RING[accent]

  return (
    <div className="relative overflow-hidden border border-ui-border-base rounded-xl bg-ui-bg-base p-10 md:p-14">
      {/* Decorative grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative flex flex-col items-center text-center max-w-md mx-auto">
        {icon && (
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ${ringClass} mb-5`}
          >
            <div className="text-2xl">{icon}</div>
          </div>
        )}

        <Heading level="h2" className="text-ui-fg-base">
          {title}
        </Heading>

        {description && (
          <Text className="text-ui-fg-subtle mt-2">{description}</Text>
        )}

        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
            {primaryAction && (
              <Button variant="primary" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default EmptyState
