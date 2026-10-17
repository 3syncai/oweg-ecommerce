"use client"

import { Container, clx } from "@medusajs/ui"
import PageLoader from "@/components/PageLoader"

type PageSkeletonProps = {
  /** Optional label shown beneath the spinner (e.g. "Loading orders…") */
  label?: string
  /** Kept for call-site compatibility; spinner is the primary loading cue */
  stats?: number
  rows?: number
  cols?: number
  showAction?: boolean
  className?: string
}

/**
 * Page loading state — circular spinner so users clearly see work in progress.
 */
const PageSkeleton = ({ label = "Loading…", className }: PageSkeletonProps) => {
  return (
    <Container className={clx("mx-auto max-w-7xl p-4 md:p-6", className)}>
      <PageLoader label={label} />
    </Container>
  )
}

export default PageSkeleton
