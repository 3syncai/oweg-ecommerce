"use client"

import { useId, useRef, useState } from "react"
import { Button } from "@medusajs/ui"

type Props = {
  onFiles: (files: File[]) => void
  disabled?: boolean
  uploading?: boolean
  label?: string
}

export default function ProductImageDropzone({ onFiles, disabled, uploading, label = "Product images" }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const busy = disabled || uploading
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={Boolean(uploading)}
      className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${dragging && !busy ? "border-ui-border-interactive bg-ui-bg-interactive/10" : "border-ui-border-base bg-ui-bg-subtle"} ${busy ? "opacity-60" : "hover:border-ui-border-interactive"}`}
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = busy ? "none" : "copy" }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDragging(false)
        if (!busy && event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <span className="text-sm font-medium" role="status">{uploading ? "Uploading images…" : "Drag and drop images here"}</span>
      <span id={`${id}-hint`} className="text-xs text-ui-fg-subtle">Or choose photos from your device · Up to 10 MB per image</span>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label={`Choose ${label.toLowerCase()}`}
        aria-describedby={`${id}-hint`}
        disabled={busy}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || [])
          event.currentTarget.value = ""
          if (!busy && files.length) onFiles(files)
        }}
      />
      <Button type="button" variant="secondary" size="small" disabled={busy} onClick={() => input.current?.click()}>
        Choose images
      </Button>
    </div>
  )
}
