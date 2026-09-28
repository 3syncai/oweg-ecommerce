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
import {
  clampLedgerRate,
  DEFAULT_PLATFORM_FEE_RATE,
  ensureVendorPlatformFeeColumns,
  getVendorPlatformFeeDefaultRate,
  resolveVendorPlatformFeeRate,
  setVendorPlatformFeeDefaultRate,
} from "../../../lib/vendor-ledger-settlement"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    await ensureVendorPlatformFeeColumns(pool)
    const [default_rate, default_platform_rate] = await Promise.all([
      getVendorCommissionDefaultRate(pool),
      getVendorPlatformFeeDefaultRate(pool),
    ])

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
        const platformOverride = v.platform_fee_override === true
        const platformResolved = resolveVendorPlatformFeeRate(
          {
            platform_fee_override: platformOverride,
            platform_fee_rate: v.platform_fee_rate,
          },
          default_platform_rate
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
          platform_fee_override: platformOverride,
          platform_fee_rate: clampLedgerRate(v.platform_fee_rate, DEFAULT_PLATFORM_FEE_RATE),
          effective_platform_rate: platformResolved.rate,
          platform_source: platformResolved.source,
        }
      })
      .sort((a: any, b: any) => {
        const an = (a.store_name || a.name || "").toLowerCase()
        const bn = (b.store_name || b.name || "").toLowerCase()
        return an.localeCompare(bn)
      })

    return res.json({
      default_rate,
      default_platform_rate,
      vendors,
      vendors_with_override: vendors.filter((v: any) => v.commission_override),
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    default_rate?: unknown
    default_platform_rate?: unknown
  }
  const hasCommission = body.default_rate !== undefined && body.default_rate !== null && body.default_rate !== ""
  const hasPlatform =
    body.default_platform_rate !== undefined &&
    body.default_platform_rate !== null &&
    body.default_platform_rate !== ""

  if (!hasCommission && !hasPlatform) {
    return res.status(400).json({
      message: "default_rate or default_platform_rate is required (0-100)",
    })
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await ensureVendorPlatformFeeColumns(pool)
    let default_rate: number | undefined
    let default_platform_rate: number | undefined

    if (hasCommission) {
      const parsed = Number(body.default_rate)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return res.status(400).json({ message: "default_rate must be a number between 0 and 100" })
      }
      default_rate = await setVendorCommissionDefaultRate(pool, parsed)
    }
    if (hasPlatform) {
      const parsed = Number(body.default_platform_rate)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return res
          .status(400)
          .json({ message: "default_platform_rate must be a number between 0 and 100" })
      }
      default_platform_rate = await setVendorPlatformFeeDefaultRate(pool, parsed)
    }

    return res.json({
      default_rate:
        default_rate ?? (await getVendorCommissionDefaultRate(pool)),
      default_platform_rate:
        default_platform_rate ?? (await getVendorPlatformFeeDefaultRate(pool)),
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
