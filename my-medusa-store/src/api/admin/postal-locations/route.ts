import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../lib/db-pool"

/** Import verified Indian postal centroids used for vendor distance ranking. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!(req as any).auth_context?.actor_id) return res.status(401).json({ message: "Admin sign-in required" })
  const entries = (req.body as any)?.locations
  if (!Array.isArray(entries) || !entries.length || entries.length > 500)
    return res.status(400).json({ message: "Provide 1–500 postal locations" })
  const clean = entries.map((entry: any) => ({
    postal_code: String(entry?.postal_code || "").trim(),
    latitude: Number(entry?.latitude), longitude: Number(entry?.longitude),
    source: String(entry?.source || "").trim().slice(0, 150),
  }))
  if (clean.some(row => !/^\d{6}$/.test(row.postal_code) || !Number.isFinite(row.latitude)
    || Math.abs(row.latitude) > 90 || !Number.isFinite(row.longitude)
    || Math.abs(row.longitude) > 180 || !row.source))
    return res.status(400).json({ message: "Each location needs a six digit PIN, valid coordinates, and source" })
  const client = await getSharedDbPool().connect()
  try {
    await client.query("BEGIN")
    for (const row of clean) await client.query(`INSERT INTO postal_location_cache
      (postal_code,latitude,longitude,source,verified_at) VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (postal_code) DO UPDATE SET latitude=EXCLUDED.latitude,
        longitude=EXCLUDED.longitude,source=EXCLUDED.source,verified_at=now()`,
      [row.postal_code, row.latitude, row.longitude, row.source])
    await client.query("COMMIT")
    return res.json({ imported: clean.length })
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined)
    return res.status(500).json({ message: error?.message || "Could not import postal locations" })
  } finally {
    client.release()
  }
}
