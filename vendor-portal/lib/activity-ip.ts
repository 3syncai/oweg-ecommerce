import { createHmac } from "node:crypto"
import { isIP } from "node:net"

/** The ingress must overwrite this header, and prevent direct access around it. */
export function portalActivityHeaders(headers: Headers): Record<string,string> {
  const result: Record<string,string> = { "x-oweg-portal": "1" }
  const header = process.env.VENDOR_ACTIVITY_CLIENT_IP_HEADER
  const key = process.env.VENDOR_ACTIVITY_PROXY_SECRET
  const ip = header && headers.get(header)?.trim()
  if (!ip || !isIP(ip) || !key) return result
  const timestamp = Date.now().toString()
  result["x-oweg-activity-ip"] = ip
  result["x-oweg-activity-time"] = timestamp
  result["x-oweg-activity-signature"] = createHmac("sha256",key).update(timestamp+"|"+ip).digest("hex")
  return result
}
