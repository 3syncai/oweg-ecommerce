import type { UploadedImageRef } from "./variant-matrix"

/** Match the backend's per-file limit before starting an upload. */
export function productImageSelectionError(files: File[]): string | null {
  if (files.some(file => !file.type.startsWith("image/"))) return "Please select image files only."
  if (files.some(file => file.size > 10 * 1024 * 1024)) return "Each image must be 10 MB or smaller."
  return null
}

/** Bounded uploads preserve order and successes when another file fails. */
export async function uploadProductImageFiles(files: File[], upload: (file: File) => Promise<UploadedImageRef>) {
  const uploaded: UploadedImageRef[] = []
  const errors: string[] = []
  for (let start = 0; start < files.length; start += 2) {
    const results = await Promise.allSettled(files.slice(start, start + 2).map(file => Promise.resolve().then(() => upload(file))))
    for (const result of results) {
      if (result.status === "fulfilled") uploaded.push(result.value)
      else errors.push(result.reason instanceof Error ? result.reason.message : "Please try again.")
    }
  }
  return { uploaded, errors }
}
