import type { Pool } from "pg"
import { Modules } from "@medusajs/framework/utils"
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "./vendor-commission"
import {
  fetchResolvedVendorCancellationCharge,
  fetchResolvedVendorPlatformFee,
  getStoreLedgerFeeRates,
} from "./vendor-ledger-settlement"
import { getMarketplaceTaxRates } from "./vendor-marketplace-tax"
import {
  getVendorWorkflow,
  getVendorWorkflows,
  mergeVendorWorkflowMetadata,
  type VendorOrderWorkflow,
  type VendorSettlementRatesSnapshot,
} from "./vendor-order-workflow"

export type { VendorSettlementRatesSnapshot }

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function readSettlementRatesSnapshot(
  workflow: VendorOrderWorkflow | Record<string, unknown> | null | undefined
): VendorSettlementRatesSnapshot | null {
  const raw = (workflow as VendorOrderWorkflow | null | undefined)?.settlement_rates
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null

  const commission_rate = asFiniteNumber((raw as any).commission_rate)
  const platform_fee_rate = asFiniteNumber((raw as any).platform_fee_rate)
  const cancellation_charge = asFiniteNumber((raw as any).cancellation_charge)
  if (commission_rate == null || platform_fee_rate == null || cancellation_charge == null) {
    return null
  }

  return {
    commission_rate,
    platform_fee_rate,
    cancellation_charge,
    partner_rate: asFiniteNumber((raw as any).partner_rate) ?? 0,
    service_gst_rate: asFiniteNumber((raw as any).service_gst_rate) ?? 18,
    tcs_rate: asFiniteNumber((raw as any).tcs_rate) ?? 0,
    tds_rate: asFiniteNumber((raw as any).tds_rate) ?? 0,
    snapshotted_at:
      typeof (raw as any).snapshotted_at === "string" && (raw as any).snapshotted_at
        ? (raw as any).snapshotted_at
        : new Date(0).toISOString(),
  }
}

export function readOrderSettlementRates(
  metadata: Record<string, unknown> | null | undefined,
  vendorId: string
): VendorSettlementRatesSnapshot | null {
  return readSettlementRatesSnapshot(getVendorWorkflow(metadata, vendorId))
}

async function fetchLiveCommissionRate(vendorId: string, pool: Pool): Promise<number> {
  const result = await pool.query<{
    commission_rate: string | number | null
    commission_override: boolean | null
  }>(
    `SELECT commission_rate, commission_override FROM vendor WHERE id = $1 LIMIT 1`,
    [vendorId]
  )
  const row = result.rows[0]
  const globalDefault = await getVendorCommissionDefaultRate(pool)
  return resolveVendorCommissionRate(
    {
      commission_rate:
        row?.commission_rate == null ? null : Number(row.commission_rate),
      commission_override: row?.commission_override === true,
    },
    globalDefault
  ).rate
}

export async function resolveLiveSettlementRates(
  vendorId: string,
  pool: Pool
): Promise<VendorSettlementRatesSnapshot> {
  const [commission_rate, platform_fee_rate, cancellation_charge, storeRates, taxRates] =
    await Promise.all([
      fetchLiveCommissionRate(vendorId, pool),
      fetchResolvedVendorPlatformFee(vendorId, pool),
      fetchResolvedVendorCancellationCharge(vendorId, pool),
      getStoreLedgerFeeRates(pool),
      getMarketplaceTaxRates(pool),
    ])

  return {
    commission_rate,
    platform_fee_rate,
    cancellation_charge,
    partner_rate: storeRates.partner_rate,
    service_gst_rate: storeRates.service_gst_rate,
    tcs_rate: taxRates.tcs_rate,
    tds_rate: taxRates.tds_rate,
    snapshotted_at: new Date().toISOString(),
  }
}

export async function listOrderVendorIdsFromItems(
  pool: Pool,
  orderId: string
): Promise<string[]> {
  const result = await pool.query<{ vendor_id: string | null }>(
    `
      SELECT DISTINCT TRIM(p.metadata->>'vendor_id') AS vendor_id
      FROM order_item oi
      JOIN order_line_item oli ON oi.item_id = oli.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
      WHERE oi.order_id = $1
        AND p.metadata->>'vendor_id' IS NOT NULL
        AND TRIM(p.metadata->>'vendor_id') <> ''
    `,
    [orderId]
  )
  return result.rows
    .map((row) => String(row.vendor_id || "").trim())
    .filter(Boolean)
}

/**
 * Freeze live rates onto order metadata for each vendor that does not already
 * have a snapshot. Idempotent — never overwrites an existing snapshot.
 */
export async function ensureOrderSettlementSnapshots(params: {
  orderId: string
  pool: Pool
  orderModule?: {
    retrieveOrder: (
      id: string,
      config?: { relations?: string[] }
    ) => Promise<{ id: string; metadata?: Record<string, unknown> | null }>
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
  }
  vendorIds?: string[]
  /** Optional container scope with Modules.ORDER for writeback */
  scope?: { resolve: (key: any) => any }
}): Promise<Record<string, VendorSettlementRatesSnapshot>> {
  const { orderId, pool } = params
  let orderModule = params.orderModule
  if (!orderModule && params.scope) {
    try {
      orderModule = params.scope.resolve(Modules.ORDER)
    } catch {
      orderModule = undefined
    }
  }

  let metadata: Record<string, unknown> = {}
  if (orderModule) {
    const order = await orderModule.retrieveOrder(orderId, {})
    metadata = { ...(order.metadata || {}) }
  } else {
    const row = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`,
      [orderId]
    )
    metadata = { ...(row.rows[0]?.metadata || {}) }
  }

  const vendorIds =
    params.vendorIds && params.vendorIds.length > 0
      ? params.vendorIds
      : [
          ...new Set([
            ...(await listOrderVendorIdsFromItems(pool, orderId)),
            ...Object.keys(getVendorWorkflows(metadata)),
          ]),
        ]

  const snapshots: Record<string, VendorSettlementRatesSnapshot> = {}
  let changed = false

  for (const vendorId of vendorIds) {
    const existing = readOrderSettlementRates(metadata, vendorId)
    if (existing) {
      snapshots[vendorId] = existing
      continue
    }

    // Legacy orders: prefer rates already stored on earnings rows over today's live settings.
    const fromLog = await pool.query<{
      commission_rate: string | number | null
      platform_fee_rate: string | number | null
      cancellation_fee: string | number | null
      partner_commission_rate: string | number | null
      tcs_rate: string | number | null
      tds_rate: string | number | null
    }>(
      `
        SELECT commission_rate, platform_fee_rate, cancellation_fee,
               partner_commission_rate, tcs_rate, tds_rate
        FROM vendor_earnings_log
        WHERE order_id = $1 AND vendor_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [orderId, vendorId]
    )
    const log = fromLog.rows[0]
    const live = await resolveLiveSettlementRates(vendorId, pool)
    const frozen: VendorSettlementRatesSnapshot = {
      ...live,
      commission_rate:
        log?.commission_rate == null ? live.commission_rate : Number(log.commission_rate),
      platform_fee_rate:
        log?.platform_fee_rate == null
          ? live.platform_fee_rate
          : Number(log.platform_fee_rate),
      cancellation_charge:
        log?.cancellation_fee == null
          ? live.cancellation_charge
          : Number(log.cancellation_fee),
      partner_rate:
        log?.partner_commission_rate == null
          ? live.partner_rate
          : Number(log.partner_commission_rate),
      tcs_rate: log?.tcs_rate == null ? live.tcs_rate : Number(log.tcs_rate),
      tds_rate: log?.tds_rate == null ? live.tds_rate : Number(log.tds_rate),
      snapshotted_at: new Date().toISOString(),
    }

    metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
      settlement_rates: frozen,
    })
    snapshots[vendorId] = frozen
    changed = true
  }

  if (changed) {
    if (orderModule) {
      await orderModule.updateOrders(orderId, { metadata })
    } else {
      await pool.query(
        `UPDATE "order" SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(metadata), orderId]
      )
    }
  }

  return snapshots
}

/**
 * Resolve rates for an existing order+vendor. Prefer frozen snapshot; if missing,
 * freeze current live rates onto the order (legacy backfill) and return those.
 */
export async function getOrFreezeOrderSettlementRates(params: {
  orderId: string
  vendorId: string
  pool: Pool
  metadata?: Record<string, unknown> | null
}): Promise<VendorSettlementRatesSnapshot> {
  const fromMeta = readOrderSettlementRates(params.metadata, params.vendorId)
  if (fromMeta) return fromMeta

  const snaps = await ensureOrderSettlementSnapshots({
    orderId: params.orderId,
    pool: params.pool,
    vendorIds: [params.vendorId],
  })
  return snaps[params.vendorId] || (await resolveLiveSettlementRates(params.vendorId, params.pool))
}
