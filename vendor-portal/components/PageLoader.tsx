"use client"

import { Text, clx } from "@medusajs/ui"

type PageLoaderProps = {
  label?: string
  className?: string
  /** full = fills the content area; inline = compact */
  size?: "full" | "inline"
}

const PageLoader = ({
  label = "Loading…",
  className,
  size = "full",
}: PageLoaderProps) => {
  const ring =
    size === "full"
      ? "h-11 w-11 border-[3px]"
      : "h-6 w-6 border-2"

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={clx(
        "flex flex-col items-center justify-center gap-3",
        size === "full" && "min-h-[50vh] w-full p-8",
        className
      )}
    >
      <div
        className={clx(
          "animate-spin rounded-full border-oweg-500/20 border-t-oweg-600 dark:border-oweg-400/20 dark:border-t-oweg-400",
          ring
        )}
        aria-hidden
      />
      {label ? (
        <Text size="small" className="text-ui-fg-subtle">
          {label}
        </Text>
      ) : null}
      <span className="sr-only">{label || "Loading"}</span>
    </div>
  )
}

export default PageLoader
