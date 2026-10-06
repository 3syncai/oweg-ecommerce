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
  clampRupeeAmount,
  DEFAULT_CANCELLATION_CHARGE,
  DEFAULT_PLATFORM_FEE_RATE,
  ensureVendorPlatformFeeColumns,
  getVendorCancellationChargeDefault,
  getVendorPlatformFeeDefaultRate,
  resolveVendorCancellationCharge,
  resolveVendorPlatformFeeRate,
  setVendorCancellationChargeDefault,
  setVendorPlatformFeeDefaultRate,
} from "../../../lib/vendor-ledger-settlement"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    await ensureVendorPlatformFeeColumns(pool)
    const [default_rate, default_platform_rate, default_cancellation_charge] = await Promise.all([
      getVendorCommissionDefaultRate(pool),
      getVendorPlatformFeeDefaultRate(pool),
      getVendorCancellationChargeDefault(pool),
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
        const cancelOverride = v.cancellation_charge_override === true
        const cancelResolved = resolveVendorCancellationCharge(
          {
            cancellation_charge_override: cancelOverride,
            cancellation_charge: v.cancellation_charge,
          },
          default_cancellation_charge
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
          cancellation_charge_override: cancelOverride,
          cancellation_charge: clampRupeeAmount(
            v.cancellation_charge,
            DEFAULT_CANCELLATION_CHARGE
          ),
          effective_cancellation_charge: cancelResolved.amount,
          cancellation_source: cancelResolved.source,
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
      default_cancellation_charge,
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
    default_cancellation_charge?: unknown
  }
  const hasCommission = body.default_rate !== undefined && body.default_rate !== null && body.default_rate !== ""
  const hasPlatform =
    body.default_platform_rate !== undefined &&
    body.default_platform_rate !== null &&
    body.default_platform_rate !== ""
  const hasCancel =
    body.default_cancellation_charge !== undefined &&
    body.default_cancellation_charge !== null &&
    body.default_cancellation_charge !== ""

  if (!hasCommission && !hasPlatform && !hasCancel) {
    return res.status(400).json({
      message: "default_rate, default_platform_rate, or default_cancellation_charge is required",
    })
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await ensureVendorPlatformFeeColumns(pool)
    let default_rate: number | undefined
    let default_platform_rate: number | undefined
    let default_cancellation_charge: number | undefined

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
    if (hasCancel) {
      const parsed = Number(body.default_cancellation_charge)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
        return res.status(400).json({
          message: "default_cancellation_charge must be rupees between 0 and 100000",
        })
      }
      default_cancellation_charge = await setVendorCancellationChargeDefault(pool, parsed)
    }

    return res.json({
      default_rate:
        default_rate ?? (await getVendorCommissionDefaultRate(pool)),
      default_platform_rate:
        default_platform_rate ?? (await getVendorPlatformFeeDefaultRate(pool)),
      default_cancellation_charge:
        default_cancellation_charge ?? (await getVendorCancellationChargeDefault(pool)),
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
