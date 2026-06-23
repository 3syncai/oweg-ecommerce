"use client"

import { ReactNode } from "react"
import { Badge, Text, clx } from "@medusajs/ui"

type StepCardProps = {
  step: number
  title: string
  children: ReactNode
  variant?: "default" | "dropzone"
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

const StepCard = ({
  step,
  title,
  children,
  variant = "default",
  className,
  style,
  onClick,
  onDragOver,
  onDrop,
}: StepCardProps) => {
  const isDropzone = variant === "dropzone"

  return (
    <div
      style={style}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clx(
        "animate-fade-in-up rounded-xl border bg-ui-bg-base p-5 md:p-6 space-y-4",
        isDropzone
          ? "cursor-pointer border-dashed border-ui-border-base/80 text-center transition-all duration-200 hover:border-ui-border-strong hover:bg-ui-bg-subtle/40 hover:shadow-sm"
          : "border-ui-border-base/70 transition-all duration-200 hover:border-ui-border-strong hover:shadow-sm",
        className
      )}
    >
      <div
        className={clx(
          "flex items-center gap-2",
          isDropzone && "justify-center"
        )}
      >
        <Badge color="blue" size="xsmall">
          Step {step}
        </Badge>
        <Text weight="plus">{title}</Text>
      </div>
      {children}
    </div>
  )
}

export default StepCard
