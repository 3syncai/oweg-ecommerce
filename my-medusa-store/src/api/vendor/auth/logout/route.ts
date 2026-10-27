import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { revokeVendorToken } from "../../_lib/token"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const auth = req.headers.authorization || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return res.status(401).json({ message: "Unauthorized" })
  try {
    if (!await revokeVendorToken(token)) {
      return res.status(401).json({ message: "Invalid token" })
    }
    return res.sendStatus(204)
  } catch {
    return res.status(503).json({ message: "Unable to revoke session. Please retry logout." })
  }
}
