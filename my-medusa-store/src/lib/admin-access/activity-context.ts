import { AsyncLocalStorage } from "node:async_hooks"
import { BlockList, isIP } from "node:net"
import type { IncomingHttpHeaders } from "node:http"

export type ActivityActor = { user_id: string; email: string; first_name?: string | null; last_name?: string | null; kind: string; role_name?: string | null }
export type ActivityLocation = { source: "offline_ip" | "local" | "unavailable"; city?: string; region?: string; country?: string; latitude?: number; longitude?: number; timezone?: string; accuracy_km?: number }
export type ActivityContext = { request_id: string; ip_address: string | null; user_agent: string; location: ActivityLocation; actor?: ActivityActor }
export const activityContext = new AsyncLocalStorage<ActivityContext>()

export const cleanActivityText = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, limit) : ""
export function normalizedIp(value: unknown): string | null {
  if (typeof value !== "string") return null
  const ip = value.trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1")
  return isIP(ip) ? ip : null
}

function inNetworks(ip: string, networks: string[]): boolean {
  const list = new BlockList()
  for (const network of networks) {
    const [raw, bits] = network.trim().split("/")
    const address = normalizedIp(raw)
    if (!address) continue
    const family = isIP(address) === 6 ? "ipv6" : "ipv4"
    try { bits === undefined ? list.addAddress(address, family) : list.addSubnet(address, Number(bits), family) } catch { /* Invalid entries do not grant proxy trust. */ }
  }
  return list.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4")
}

export function clientActivityIp(peer: unknown, forwarded: unknown, trustedNetworks = process.env.ADMIN_AUDIT_TRUSTED_PROXIES || ""): string | null {
  let current = normalizedIp(peer)
  if (!current || typeof forwarded !== "string" || forwarded.length > 2048 || !trustedNetworks) return current
  const trusted = trustedNetworks.split(",")
  const chain = forwarded.split(",").map(value => normalizedIp(value))
  if (chain.some(value => !value)) return current
  // Walk outward from the socket. A client cannot spoof an earlier header
  // unless every intervening proxy is explicitly trusted by this deployment.
  for (const candidate of chain.reverse()) {
    if (!inNetworks(current, trusted)) break
    current = candidate!
  }
  return current
}

const privateNetworks = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "2001:db8::/32"]
let geoip: { lookup: (ip: string) => any } | undefined
export function activityLocation(ip: string | null): ActivityLocation {
  if (!ip) return { source: "unavailable" }
  if (inNetworks(ip, privateNetworks)) return { source: "local" }
  try {
    // Lazy load the bundled database. No IP addresses leave this server.
    geoip ||= require("geoip-lite")
    const result = geoip!.lookup(ip)
    if (!result) return { source: "unavailable" }
    return { source: "offline_ip", city: result.city || undefined, region: result.region || undefined, country: result.country || undefined, latitude: result.ll?.[0], longitude: result.ll?.[1], timezone: result.timezone || undefined, accuracy_km: result.area || undefined }
  } catch { return { source: "unavailable" } }
}

export function requestActivityContext(req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }, requestId: string): ActivityContext {
  const ip = clientActivityIp(req.socket.remoteAddress, req.headers["x-forwarded-for"])
  return { request_id: requestId, ip_address: ip, user_agent: cleanActivityText(req.headers["user-agent"], 500), location: activityLocation(ip) }
}

export function safeActivityPath(input: string): string {
  // Queries can contain email, credentials and search input. Never store them.
  return cleanActivityText(input.split(/[?#]/, 1)[0], 500)
}

export function changedActivityFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return []
  return Object.keys(body).filter(key => /^[a-z][a-z0-9_]{0,49}$/i.test(key) && !/password|token|secret|credential|authorization|cookie|bank|account_no|card|upi/i.test(key)).slice(0, 50)
}

export function activityResourceId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  for (const key of ["product", "customer", "customer_group", "order", "draft_order", "vendor", "promotion", "campaign", "collection", "product_category", "price_list", "role", "permission", "user"]) {
    const id = (body as Record<string, any>)[key]?.id
    if (typeof id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(id)) return id
  }
  return null
}
