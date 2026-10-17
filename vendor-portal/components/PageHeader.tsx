"use client"

import type { CSSProperties, ReactNode } from "react"
import { Heading, Text, clx } from "@medusajs/ui"

type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
  style?: CSSProperties
}

const PageHeader = ({ title, description, actions, icon, className, style }: PageHeaderProps) => (
  <div
    style={style}
    className={clx(
      "animate-fade-in-up flex flex-wrap items-start justify-between gap-4",
      className
    )}
  >
    <div className="max-w-2xl min-w-0">
      <div className="flex items-center gap-3">
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ui-bg-subtle text-ui-fg-base">
            {icon}
          </div>
        ) : null}
        <Heading level="h1" className="text-2xl tracking-tight md:text-3xl">
          {title}
        </Heading>
      </div>
      {description ? (
        <Text size="small" className="mt-1.5 text-ui-fg-subtle">
          {description}
        </Text>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
)

export default PageHeader
