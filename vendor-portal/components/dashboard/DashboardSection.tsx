"use client"

import { ReactNode } from "react"
import { Button, Heading, clx } from "@medusajs/ui"
import { ArrowUpRightMini } from "@medusajs/icons"

type DashboardSectionProps = {
  title: string
  action?: {
    label: string
    onClick: () => void
  }
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

const DashboardSection = ({
  title,
  action,
  children,
  className,
  style,
}: DashboardSectionProps) => (
  <section style={style} className={clx("animate-fade-in-up flex flex-col", className)}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <Heading
        level="h3"
        className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-ui-fg-base"
      >
        {title}
      </Heading>
      {action && (
        <Button
          variant="transparent"
          size="small"
          className="!text-emerald-700 transition-transform active:scale-[0.98] dark:!text-oweg-600"
          onClick={action.onClick}
        >
          {action.label}
          <ArrowUpRightMini />
        </Button>
      )}
    </div>
    {children}
  </section>
)

export default DashboardSection
