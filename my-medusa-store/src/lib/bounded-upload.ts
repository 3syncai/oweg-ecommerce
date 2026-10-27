import Busboy from "busboy"
import type { Readable } from "node:stream"
import type { IncomingHttpHeaders } from "node:http"
import type { EventEmitter } from "node:events"

const MB = 1024 * 1024
const MAX_ACTIVE_UPLOADS = 4
let activeUploads = 0

/** Limits apply while streaming, even when Content-Length is absent or incorrect. */
export function boundedUpload(
  headers: IncomingHttpHeaders,
  response: EventEmitter,
  options: { fileSize?: number; files?: number; totalSize?: number } = {}
) {
  const fileSize = options.fileSize ?? 10 * MB
  const files = options.files ?? 5
  const totalSize = options.totalSize ?? 25 * MB
  const error = (message: string, statusCode = 413) => Object.assign(new Error(message), { statusCode })
  if (activeUploads >= MAX_ACTIVE_UPLOADS) throw error("Too many concurrent uploads. Please retry.", 429)
  const length = Number(headers["content-length"])
  if (Number.isFinite(length) && length > totalSize + MB) throw error("Upload request is too large")
  const bb = Busboy({ headers, limits: { fileSize, files, fields: 50, fieldSize: 64 * 1024, parts: files + 50 } })
  activeUploads++
  let released = false
  const release = () => {
    if (released) return
    released = true
    activeUploads--
    response.removeListener("finish", release)
    response.removeListener("close", release)
  }
  // Keep the slot until S3 work and response complete, not merely until parsing ends.
  response.once("finish", release)
  response.once("close", release)
  let failed = false
  let bytes = 0
  const streams = new Set<Readable>()
  const fail = (message: string) => {
    if (failed) return
    failed = true
    const err = error(message)
    for (const file of streams) file.destroy(err)
    // Busboy may still be inside its file-size callback; defer parser destruction.
    queueMicrotask(() => bb.destroy(err))
  }
  bb.on("file", (_name, file) => {
    streams.add(file)
    file.on("error", () => {}) // A skipped file may have no route-level error listener.
    file.once("close", () => streams.delete(file))
    file.once("limit", () => fail("File exceeds upload size limit"))
    file.on("data", (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > totalSize) fail("Combined files exceed upload size limit")
    })
  })
  bb.on("field", (_name, _value, info) => {
    if (info.valueTruncated || info.nameTruncated) fail("Upload field exceeds size limit")
  })
  bb.on("filesLimit", () => fail("Too many uploaded files"))
  bb.on("fieldsLimit", () => fail("Too many upload fields"))
  bb.on("partsLimit", () => fail("Too many multipart sections"))
  return bb
}
