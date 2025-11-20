import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import fs from "node:fs"
import path from "node:path"
import mime from "mime"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = new URL(req.url)
  const p = url.searchParams.get("path") || ""
  if (!p) return res.status(400).send("path required")
  const safe = p.replace(/\.\./g, "").replace(/^\/+/, "")
  const full = path.join(process.cwd(), "uploads", safe)
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return res.status(404).send("Not found")
  }
  const contentType = mime.getType(full) || "application/octet-stream"
  res.setHeader("Content-Type", contentType)
  const stream = fs.createReadStream(full)
  // @ts-ignore piping supported
  stream.pipe(res)
}


