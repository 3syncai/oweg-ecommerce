import { forwardRef, useEffect, type HTMLAttributes } from "react"
import { usePrompt } from "@medusajs/ui"
import { ThumbnailBadge } from "@medusajs/icons"

export function thumbnailIndex(media: Array<{ isThumbnail?: boolean }>): number {
  const selected = media.findIndex(image => image.isThumbnail)
  return selected >= 0 ? selected : media.length ? 0 : -1
}

/** Promote once after append/removal; subsequent reorders keep that choice. */
export function useOwegMediaThumbnail<T extends { isThumbnail?: boolean }>(
  media: T[], update: (index: number, value: T) => void
) {
  const prompt = usePrompt()
  useEffect(() => {
    if (media.length && !media.some(image => image.isThumbnail)) {
      update(0, { ...media[0], isThumbnail: true })
    }
  }, [media, update])
  return prompt
}

export const OwegMediaThumbnailBadge = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function OwegMediaThumbnailBadge(props, ref) {
    return <span title="Thumbnail / Main image" {...props} ref={ref} style={{
      display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 5px",
      borderRadius: 6, background: "#155344", color: "white", fontSize: 10,
      fontWeight: 600, lineHeight: 1.2, ...props.style,
    }}><ThumbnailBadge aria-hidden="true" style={{ width: 12, height: 12 }} />Main image</span>
  }
)
