"use client"

import { ReactNode } from "react"
import { Text, clx } from "@medusajs/ui"

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
        "rounded-2xl border bg-ui-bg-base p-5 sm:p-7 space-y-5 min-w-0",
        isDropzone
          ? "cursor-pointer border-dashed border-emerald-300 bg-emerald-50/40 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50"
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
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-800">0{step}</span>
        <Text weight="plus">{title}</Text>
      </div>
      {children}
    </div>
  )
}

export default StepCard
