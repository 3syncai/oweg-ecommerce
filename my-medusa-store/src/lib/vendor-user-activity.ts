import { createHmac, timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { clientActivityIp, normalizedIp } from "./admin-access/activity-context"
import { getSharedDbPool } from "./db-pool"
import { checkRateLimit } from "./simple-rate-limit"

export function vendorActivityIp(req: Pick<MedusaRequest, "headers" | "socket">) {
  const headers = req.headers
  if (headers["x-oweg-portal"] !== "1") {
    return clientActivityIp(req.socket?.remoteAddress, headers["x-forwarded-for"], process.env.VENDOR_ACTIVITY_TRUSTED_PROXIES || "")
  }
  const ip = headers["x-oweg-activity-ip"]
  const stamp = headers["x-oweg-activity-time"]
  const signature = headers["x-oweg-activity-signature"]
  const secret = process.env.VENDOR_ACTIVITY_PROXY_SECRET
  if (!secret || typeof ip !== "string" || !normalizedIp(ip) || typeof stamp !== "string" ||
      !/^\d{13}$/.test(stamp) || Math.abs(Date.now()-Number(stamp)) > 60000 ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return null
  const expected = createHmac("sha256",secret).update(stamp+"|"+ip).digest()
  return timingSafeEqual(expected,Buffer.from(signature,"hex")) ? normalizedIp(ip) : null
}

export async function recordVendorActivity(req: MedusaRequest, userId: string, login=false) {
  try {
    if (!login && !checkRateLimit({key:"vendor-activity:"+userId,limit:60,windowMs:60000}).allowed) return
    const ip = vendorActivityIp(req)
    const observed = new Date()
    await getSharedDbPool().query(`
      INSERT INTO vendor_user_activity(user_id, login_ip, login_at, activity_ip, activity_at)
      VALUES($1,CASE WHEN $4 THEN $2::inet END,CASE WHEN $4 THEN $3::timestamptz END,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET
        login_ip=CASE WHEN $4 AND (vendor_user_activity.login_at IS NULL OR vendor_user_activity.login_at <= $3) THEN $2 ELSE vendor_user_activity.login_ip END,
        login_at=CASE WHEN $4 THEN GREATEST(vendor_user_activity.login_at,$3) ELSE vendor_user_activity.login_at END,
        activity_ip=CASE WHEN vendor_user_activity.activity_at <= $3 THEN $2 ELSE vendor_user_activity.activity_ip END,
        activity_at=GREATEST(vendor_user_activity.activity_at,$3)
      WHERE $4 OR (vendor_user_activity.activity_at <= $3 AND (vendor_user_activity.activity_ip IS DISTINCT FROM $2 OR
        vendor_user_activity.activity_at <= $3::timestamptz - interval '5 minutes'))`, [userId,ip,observed,login])
  } catch {
    // Audit storage is independent of the vendor operation. Limit repeated outage logs.
    if (checkRateLimit({key:"vendor-activity-storage-error",limit:1,windowMs:60000}).allowed) console.warn("[vendor-activity] Storage unavailable")
  }
}

export async function vendorAccountActivity(vendorId: string) {
  const {rows} = await getSharedDbPool().query(`
    SELECT u.email, host(a.login_ip) AS login_ip, a.login_at, host(a.activity_ip) AS activity_ip, a.activity_at
    FROM vendor_user u LEFT JOIN vendor_user_activity a ON a.user_id=u.id
    WHERE u.vendor_id=$1 AND u.deleted_at IS NULL ORDER BY u.email`,[vendorId])
  return rows
}
