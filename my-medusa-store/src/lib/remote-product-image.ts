import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

const MAX_BYTES = 10 * 1024 * 1024
const blocked = new BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4")
const globalV6 = new BlockList()
globalV6.addSubnet("2000::", 3, "ipv6")
blocked.addSubnet("2001::", 23, "ipv6")
blocked.addSubnet("2001:db8::", 32, "ipv6")
blocked.addSubnet("2002::", 16, "ipv6")
blocked.addSubnet("3fff::", 20, "ipv6")

export class RemoteImageInputError extends Error {}
export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6")
}

export function remoteImageUrl(input: string): URL {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new RemoteImageInputError("Enter a complete HTTP or HTTPS image link") }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || input.length > 4096)
    throw new RemoteImageInputError("Use a public HTTP or HTTPS image link without credentials")
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
    throw new RemoteImageInputError("Image links must use standard HTTP/HTTPS ports")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || /\.(localhost|local|internal)$/i.test(host) || (isIP(host) && !isPublicImageAddress(host)))
    throw new RemoteImageInputError("Image links must point to a public internet address")
  url.hash = ""
  return url
}

export function imageFileType(bytes: Buffer): { mime: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: "image/jpeg", extension: "jpg" }
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: "image/png", extension: "png" }
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return { mime: "image/gif", extension: "gif" }
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", extension: "webp" }
  if (bytes.subarray(4, 8).toString() === "ftyp" && /avif|avis/.test(bytes.subarray(8, 32).toString())) return { mime: "image/avif", extension: "avif" }
  return null
}

export type DownloadedImage = { url: string; bytes: Buffer; mime: string; extension: string }

/** Validate every redirect and pin the socket to a verified DNS answer (no rebinding). */
export async function downloadPublicImage(input: string, secureOnly = false): Promise<DownloadedImage> {
  const deadline = Date.now() + 15000
  let current = remoteImageUrl(input)
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (secureOnly && current.protocol !== "https:") throw new Error("HTTPS image link redirects to insecure HTTP")
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("Image source timed out")
    const host = current.hostname.replace(/^\[|\]$/g, "")
    let dnsTimer: ReturnType<typeof setTimeout> | undefined
    const answers = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("Image DNS lookup timed out")), remaining) }),
    ]).finally(() => clearTimeout(dnsTimer))
    if (!answers.length || answers.some(answer => !isPublicImageAddress(answer.address)))
      throw new RemoteImageInputError("Image hostname resolves to a non-public address")
    const selected = answers.find(answer => answer.family === 4) || answers[0]
    const response = await new Promise<{ redirect?: string; bytes?: Buffer }>((resolve, reject) => {
      const request = (current.protocol === "https:" ? httpsRequest : httpRequest)(current, {
        headers: { Accept: "image/jpeg,image/png,image/webp,image/gif,image/avif", "User-Agent": "OWEG-Image-Importer/1.0" },
        lookup: (_hostname, options, callback) => options.all
          ? callback(null, [selected])
          : callback(null, selected.address, selected.family),
      }, res => {
        const status = res.statusCode || 0
        if ([301,302,303,307,308].includes(status)) {
          const location = res.headers.location
          res.destroy()
          if (!location) reject(new Error("Image redirect has no location"))
          else resolve({ redirect: location })
          return
        }
        if (status !== 200) { res.destroy(); reject(new Error(`Image source returned HTTP ${status}`)); return }
        const type = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase()
        if (!type.startsWith("image/") || type === "image/svg+xml") { res.destroy(); reject(new Error("Link does not return a supported image")); return }
        if (Number(res.headers["content-length"]) > MAX_BYTES) { res.destroy(); reject(new Error("Image exceeds 10 MB")); return }
        const chunks: Buffer[] = []
        let length = 0
        res.on("data", (chunk: Buffer) => {
          length += chunk.length
          if (length > MAX_BYTES) res.destroy(new Error("Image exceeds 10 MB"))
          else chunks.push(chunk)
        })
        res.on("error", reject)
        res.on("aborted", () => reject(new Error("Image download was interrupted")))
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks) }))
      })
      const timer = setTimeout(() => request.destroy(new Error("Image source timed out")), Math.max(1, deadline - Date.now()))
      request.on("error", reject)
      request.on("close", () => clearTimeout(timer))
      request.end()
    })
    if (response.redirect) { current = remoteImageUrl(new URL(response.redirect, current).href); continue }
    const bytes = response.bytes || Buffer.alloc(0), type = imageFileType(bytes)
    if (!type) throw new Error("Link does not contain a supported JPEG, PNG, WebP, GIF or AVIF image")
    return { url: current.href, bytes, ...type }
  }
  throw new Error("Image link has too many redirects")
}

/** HTTP input prefers HTTPS; HTTP-only images are copied to owned HTTPS storage. */
export async function resolveRemoteProductImage(
  input: string,
  storeImage: (image: DownloadedImage) => Promise<{ url: string; key: string }>,
  download = downloadPublicImage,
): Promise<{ url: string; key: string; stored: boolean }> {
  const original = remoteImageUrl(input)
  const secure = new URL(original)
  secure.protocol = "https:"
  try {
    const image = await download(secure.href, true)
    return { url: image.url, key: "", stored: false }
  } catch (error) {
    if (original.protocol !== "http:" || error instanceof RemoteImageInputError) throw error
  }
  const image = await download(original.href)
  const stored = await storeImage(image)
  if (remoteImageUrl(stored.url).protocol !== "https:") throw new Error("Imported image storage must use HTTPS")
  return { ...stored, stored: true }
}
