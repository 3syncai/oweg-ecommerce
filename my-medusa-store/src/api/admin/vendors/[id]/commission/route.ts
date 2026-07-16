import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import VendorModuleService from "../../../../../modules/vendor/service"
import {
  clampCommissionRate,
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../../lib/vendor-commission"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params?.id as string
  if (!id) return res.status(400).json({ message: "Missing vendor id" })

  const body = (req.body || {}) as {
    commission_override?: boolean
    commission_rate?: number | string
  }

  if (typeof body.commission_override !== "boolean") {
    return res.status(400).json({ message: "commission_override (boolean) is required" })
  }

  if (body.commission_override === true) {
    if (body.commission_rate === undefined || body.commission_rate === null || body.commission_rate === "") {
      return res.status(400).json({ message: "commission_rate is required when override is enabled" })
    }
    const n = Number(body.commission_rate)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return res.status(400).json({ message: "commission_rate must be 0-100" })
    }
  }

  const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
  const [existing] = await vendorService.listVendors({ id })
  if (!existing) return res.status(404).json({ message: "Vendor not found" })

  const update: Record<string, unknown> = {
    id,
    commission_override: body.commission_override,
  }
  if (body.commission_override === true) {
    update.commission_rate = clampCommissionRate(body.commission_rate)
  }

  const updated = await vendorService.updateVendors(update)
  const vendor = Array.isArray(updated) ? updated[0] : updated

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const globalDefault = await getVendorCommissionDefaultRate(pool)
    const resolved = resolveVendorCommissionRate(vendor as any, globalDefault)
    return res.json({
      vendor,
      effective_rate: resolved.rate,
      source: resolved.source,
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
