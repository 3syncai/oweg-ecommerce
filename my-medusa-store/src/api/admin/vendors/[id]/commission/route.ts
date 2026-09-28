import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import VendorModuleService from "../../../../../modules/vendor/service"
import {
  clampCommissionRate,
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../../lib/vendor-commission"
import {
  clampLedgerRate,
  DEFAULT_PLATFORM_FEE_RATE,
  ensureVendorPlatformFeeColumns,
  getVendorPlatformFeeDefaultRate,
  resolveVendorPlatformFeeRate,
} from "../../../../../lib/vendor-ledger-settlement"

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params?.id as string
  if (!id) return res.status(400).json({ message: "Missing vendor id" })

  const body = (req.body || {}) as {
    commission_override?: boolean
    commission_rate?: number | string
    platform_fee_override?: boolean
    platform_fee_rate?: number | string
  }

  const hasCommission = typeof body.commission_override === "boolean"
  const hasPlatform = typeof body.platform_fee_override === "boolean"
  if (!hasCommission && !hasPlatform) {
    return res.status(400).json({
      message: "commission_override or platform_fee_override is required",
    })
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

  if (body.platform_fee_override === true) {
    if (body.platform_fee_rate === undefined || body.platform_fee_rate === null || body.platform_fee_rate === "") {
      return res.status(400).json({ message: "platform_fee_rate is required when override is enabled" })
    }
    const n = Number(body.platform_fee_rate)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return res.status(400).json({ message: "platform_fee_rate must be 0-100" })
    }
  }

  const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
  const [existing] = await vendorService.listVendors({ id })
  if (!existing) return res.status(404).json({ message: "Vendor not found" })

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await ensureVendorPlatformFeeColumns(pool)

    const update: Record<string, unknown> = { id }
    if (hasCommission) {
      update.commission_override = body.commission_override
      if (body.commission_override === true) {
        update.commission_rate = clampCommissionRate(body.commission_rate)
      }
    }
    if (hasPlatform) {
      update.platform_fee_override = body.platform_fee_override
      if (body.platform_fee_override === true) {
        update.platform_fee_rate = clampLedgerRate(
          body.platform_fee_rate,
          DEFAULT_PLATFORM_FEE_RATE
        )
      }
    }

    const updated = await vendorService.updateVendors(update)
    const vendor = Array.isArray(updated) ? updated[0] : updated

    const [globalDefault, platformDefault] = await Promise.all([
      getVendorCommissionDefaultRate(pool),
      getVendorPlatformFeeDefaultRate(pool),
    ])
    const resolved = resolveVendorCommissionRate(vendor as any, globalDefault)
    const platformResolved = resolveVendorPlatformFeeRate(vendor as any, platformDefault)
    return res.json({
      vendor,
      effective_rate: resolved.rate,
      source: resolved.source,
      effective_platform_rate: platformResolved.rate,
      platform_source: platformResolved.source,
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
