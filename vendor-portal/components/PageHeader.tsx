"use client"

import type { CSSProperties, ReactNode } from "react"
import { Heading, Text, clx } from "@medusajs/ui"

type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
  style?: CSSProperties
}

const PageHeader = ({ title, description, actions, className, style }: PageHeaderProps) => (
  <div
    style={style}
    className={clx(
      "animate-fade-in-up flex flex-wrap items-start justify-between gap-4",
      className
    )}
  >
    <div className="max-w-2xl min-w-0">
      <Heading level="h1" className="text-2xl tracking-tight md:text-3xl">
        {title}
      </Heading>
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
