"use client"

/**
 * Admin UI for bulk product import that also accepts the images inside the
 * same ZIP. Calls our custom POST /admin/products/bulk-import-with-images
 * endpoint, shows the preview (toCreate / toUpdate + how many images were
 * uploaded to S3), and then confirms via
 * POST /admin/products/bulk-import-with-images/:transaction_id/confirm.
 */

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowUpTray } from "@medusajs/icons"
import {
  Container,
  Heading,
  Text,
  Button,
  Badge,
  toast,
} from "@medusajs/ui"
import { useRef, useState, useCallback, useEffect } from "react"

type PreviewResponse = {
  transaction_id: string
  summary: {
    toCreate: number
    toUpdate: number
  }
  images: {
    uploaded: number
    rewritten_csv_cells: number
  }
}

type ServerError = {
  message: string
  missingImages?: { row: number; column: string; ref: string }[]
  errors?: { ref: string; error: string }[]
  csvFiles?: string[]
}

const BulkImportWithImagesPage = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [error, setError] = useState<ServerError | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const handleSelected = useCallback((f: File | null) => {
    setError(null)
    setPreview(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError({
        message: `"${f.name}" is not a .zip file. Please upload a ZIP containing your CSV and image files.`,
      })
      setFile(null)
      return
    }
    setFile(f)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files?.[0] ?? null
      handleSelected(f)
    },
    [handleSelected]
  )

  const upload = useCallback(async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setPreview(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/admin/products/bulk-import-with-images", {
        method: "POST",
        credentials: "include",
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body as ServerError)
        return
      }
      setPreview(body as PreviewResponse)
    } catch (err: any) {
      setError({ message: err?.message ?? "Unexpected error" })
    } finally {
      setUploading(false)
    }
  }, [file])

  const confirm = useCallback(async () => {
    if (!preview) return
    setConfirming(true)
    try {
      const res = await fetch(
        `/admin/products/bulk-import-with-images/${preview.transaction_id}/confirm`,
        {
          method: "POST",
          credentials: "include",
        }
      )
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.message || "Failed to confirm import")
        return
      }
      toast.success(
        `Import started — ${preview.summary.toCreate} to create, ${preview.summary.toUpdate} to update. Watch the notifications feed for completion.`
      )
      reset()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to confirm import")
    } finally {
      setConfirming(false)
    }
  }, [preview, reset])

  // Clean up the object URL preview (none right now, but keeps lint happy
  // when this expands later).
  useEffect(() => () => undefined, [])

  return (
    <Container className="p-0">
      <div className="px-6 py-4 border-b border-ui-border-base">
        <Heading level="h1">Bulk Import with Images</Heading>
        <Text className="text-ui-fg-subtle mt-1">
          Upload a single ZIP that contains your products CSV and all referenced image files.
          Images are pushed to S3 automatically and the CSV is rewritten with the resulting URLs
          before the standard import runs.
        </Text>
      </div>

      <div className="px-6 py-6 space-y-6">
        {!preview && (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={[
                "cursor-pointer rounded-lg border-2 border-dashed transition-colors",
                "flex flex-col items-center justify-center text-center",
                "px-6 py-12",
                dragOver
                  ? "border-ui-border-interactive bg-ui-bg-base-hover"
                  : "border-ui-border-strong bg-ui-bg-subtle",
              ].join(" ")}
            >
              <ArrowUpTray />
              <Text className="mt-3 font-medium">
                {file ? file.name : "Drag and drop a .zip file, or click to browse"}
              </Text>
              <Text className="text-ui-fg-subtle text-sm mt-1">
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                  : "ZIP must contain exactly one CSV and the referenced image files."}
              </Text>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => handleSelected(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex items-center gap-x-2 justify-end">
              {file && (
                <Button variant="secondary" onClick={reset} disabled={uploading}>
                  Clear
                </Button>
              )}
              <Button
                variant="primary"
                onClick={upload}
                disabled={!file || uploading}
                isLoading={uploading}
              >
                Upload &amp; preview
              </Button>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="rounded-lg border border-ui-border-base p-4">
              <Heading level="h2" className="mb-2">
                Ready to import
              </Heading>
              <div className="flex flex-wrap gap-2">
                <Badge color="green">
                  {preview.summary.toCreate} to create
                </Badge>
                <Badge color="blue">
                  {preview.summary.toUpdate} to update
                </Badge>
                <Badge color="purple">
                  {preview.images.uploaded} images uploaded to S3
                </Badge>
                <Badge color="grey">
                  {preview.images.rewritten_csv_cells} CSV cells rewritten
                </Badge>
              </div>
              <Text className="text-ui-fg-subtle text-sm mt-3">
                Click &ldquo;Confirm import&rdquo; to apply these changes. The import runs in the
                background; you&rsquo;ll see a notification when it finishes.
              </Text>
            </div>

            <div className="flex items-center gap-x-2 justify-end">
              <Button variant="secondary" onClick={reset} disabled={confirming}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirm}
                isLoading={confirming}
              >
                Confirm import
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-4 space-y-2">
            <Text className="font-medium text-ui-tag-red-text">{error.message}</Text>

            {error.csvFiles && error.csvFiles.length > 0 && (
              <div>
                <Text className="text-sm text-ui-tag-red-text font-medium">
                  CSV files found:
                </Text>
                <ul className="list-disc pl-5 text-sm text-ui-tag-red-text">
                  {error.csvFiles.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {error.missingImages && error.missingImages.length > 0 && (
              <div>
                <Text className="text-sm text-ui-tag-red-text font-medium">
                  Missing image references ({error.missingImages.length}):
                </Text>
                <ul className="list-disc pl-5 text-sm text-ui-tag-red-text max-h-48 overflow-auto">
                  {error.missingImages.slice(0, 50).map((m, i) => (
                    <li key={`${m.row}-${i}`}>
                      Row {m.row}, column &ldquo;{m.column}&rdquo;: {m.ref}
                    </li>
                  ))}
                  {error.missingImages.length > 50 && (
                    <li>… and {error.missingImages.length - 50} more</li>
                  )}
                </ul>
              </div>
            )}

            {error.errors && error.errors.length > 0 && (
              <div>
                <Text className="text-sm text-ui-tag-red-text font-medium">
                  S3 upload errors:
                </Text>
                <ul className="list-disc pl-5 text-sm text-ui-tag-red-text">
                  {error.errors.map((e, i) => (
                    <li key={i}>
                      {e.ref}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-ui-border-base p-4">
          <Heading level="h3" className="mb-2">
            How it works
          </Heading>
          <ol className="list-decimal pl-5 text-sm text-ui-fg-subtle space-y-1">
            <li>
              Download the standard CSV template from the regular &ldquo;Import Products&rdquo;
              button (top right of the products page).
            </li>
            <li>
              In the image columns (<code>Product Thumbnail</code>,{" "}
              <code>Product Image 1 Url</code>, …) put either a public URL or the bare
              filename / relative path of an image (e.g. <code>red-shirt-front.jpg</code>{" "}
              or <code>images/red-shirt-front.jpg</code>).
            </li>
            <li>
              Put the CSV and all referenced image files into a single folder and zip it.
              Folder structure inside the ZIP is up to you — we match by filename.
            </li>
            <li>
              Upload the ZIP here. Every bundled image is pushed to S3, the CSV cells are
              rewritten with the resulting URLs, and the standard Medusa importer runs.
            </li>
          </ol>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Bulk Import (with Images)",
  icon: ArrowUpTray,
})

export default BulkImportWithImagesPage
