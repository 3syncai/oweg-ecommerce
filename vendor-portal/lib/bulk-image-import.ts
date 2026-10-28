import { isRemoteImageSource } from "./bulk-image-source"

export type RemoteImageState =
  | { status: "checking"; source: string }
  | { status: "uploaded"; url: string; key: string; originalName: string }
  | { status: "error"; message: string }

/** Three requests at a time; repeated references share one result. No product writes. */
export async function importBulkImageSources(
  refs: string[],
  importOne: (url: string, signal?: AbortSignal) => Promise<{ url: string; key?: string }>,
  update: (key: string, state: RemoteImageState) => void,
  signal?: AbortSignal,
) {
  const sources = [...new Set(refs.map(ref => ref.trim()).filter(isRemoteImageSource))]
  let cursor = 0, ready = 0, failed = 0
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (cursor < sources.length && !signal?.aborted) {
      const source = sources[cursor++]
      update(source, { status: "checking", source })
      try {
        const image = await importOne(source, signal)
        const result = new URL(image.url)
        if (result.protocol !== "https:" || result.username || result.password) throw new Error("Imported image must use HTTPS")
        if (signal?.aborted) return
        update(source, { status: "uploaded", url: image.url, key: image.key || "", originalName: source })
        ready++
      } catch (error) {
        if (signal?.aborted) return
        update(source, { status: "error", message: error instanceof Error ? error.message : "Image link could not be loaded" })
        failed++
      }
    }
  }))
  return { ready, failed }
}
