import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../modules/vendor"
import VendorModuleService from "../../../modules/vendor/service"
import {
  getVendorCommissionDefaultRate,
  setVendorCommissionDefaultRate,
  clampCommissionRate,
  resolveVendorCommissionRate,
} from "../../../lib/vendor-commission"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    const default_rate = await getVendorCommissionDefaultRate(pool)

    const allVendors = await vendorService.listVendors({})
    const vendors = (allVendors || [])
      .filter((v: any) => !v.deleted_at)
      .map((v: any) => {
        const override = v.commission_override === true
        const resolved = resolveVendorCommissionRate(
          {
            commission_override: override,
            commission_rate: v.commission_rate,
          },
          default_rate
        )
        return {
          id: v.id,
          name: v.name,
          store_name: v.store_name,
          email: v.email,
          is_approved: !!v.is_approved,
          commission_override: override,
          commission_rate: clampCommissionRate(v.commission_rate),
          effective_rate: resolved.rate,
          source: resolved.source,
        }
      })
      .sort((a: any, b: any) => {
        const an = (a.store_name || a.name || "").toLowerCase()
        const bn = (b.store_name || b.name || "").toLowerCase()
        return an.localeCompare(bn)
      })

    return res.json({
      default_rate,
      vendors,
      vendors_with_override: vendors.filter((v: any) => v.commission_override),
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as { default_rate?: unknown }
  if (body.default_rate === undefined || body.default_rate === null || body.default_rate === "") {
    return res.status(400).json({ message: "default_rate is required (0-100)" })
  }
  const parsed = Number(body.default_rate)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return res.status(400).json({ message: "default_rate must be a number between 0 and 100" })
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const default_rate = await setVendorCommissionDefaultRate(pool, parsed)
    return res.json({ default_rate })
  } finally {
    await pool.end().catch(() => {})
  }
}
