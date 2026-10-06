import type { Pool } from "pg";
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "./vendor-commission";
import {
  calculateMarketplaceSettlementFromLines,
  getMarketplaceTaxRates,
  parseLineGstRate,
} from "./vendor-marketplace-tax";
import {
  adminPayableNetFromLedger,
  buildLedgerRatesForVendor,
  calculateVendorLedgerSettlement,
  overlaySaleDeductions,
  type LedgerCategory,
  type LedgerSettlementBreakdown,
} from "./vendor-ledger-settlement";
import {
  getOrFreezeOrderSettlementRates,
  readOrderSettlementRates,
} from "./vendor-settlement-snapshot";
import { getVendorWorkflow } from "./vendor-order-workflow";

export const VENDOR_EARNINGS_UNLOCK_MINUTES = 5;

export type VendorEarningStatus =
  | "UNLOCKING"
  | "CREDITED"
  | "PAID"
  | "REVERSED"
  /** Customer return pending admin — unlock timer paused, not payable */
  | "ON_HOLD";

export type VendorEarningRow = {
  id: string;
  vendor_id: string;
  order_id: string;
  order_display_id: string | null;
  gross_amount: number;
  taxable_amount?: number;
  gst_amount?: number;
  gst_rate?: number;
  commission_rate: number;
  commission_amount: number;
  tcs_rate?: number;
  tcs_amount?: number;
  tds_rate?: number;
  tds_amount?: number;
  net_amount: number;
  currency_code: string;
  status: VendorEarningStatus;
  delivered_at: string | null;
  unlock_at: string | null;
  credited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorEarningsSummary = {
  available_balance: number;
  unlocking_balance: number;
  total_credited: number;
  total_withdrawn: number;
  unlocking: Array<{
    id: string;
    order_id: string;
    order_display_id: string | null;
    net_amount: number;
    gross_amount: number;
    commission_rate: number;
    commission_amount: number;
    unlock_at: string;
    delivered_at: string | null;
  }>;
  credited_recent: Array<{
    id: string;
    order_id: string;
    order_display_id: string | null;
    net_amount: number;
    gross_amount: number;
    commission_rate: number;
    commission_amount: number;
    credited_at: string | null;
  }>;
  reversed_recent: Array<{
    id: string;
    order_id: string;
    order_display_id: string | null;
    net_amount: number;
    reversed_at: string | null;
  }>;
  reversed_total: number;
};

export type VendorPaymentSettlement = {
  id: string;
  order_id: string;
  order_display_id: string | null;
  product_name: string;
  type: "sales" | "return" | "claim" | "payment" | "cancellation";
  category: LedgerCategory;
  order_date?: string | null;
  invoice_no?: string;
  item_status?: string;
  order_amount: number;
  taxable_amount: number;
  gst_amount: number;
  gst_rate: number;
  listing_gst: number;
  listing_total: number;
  platform_rate: number;
  platform_fee: number;
  platform_gst: number;
  platform_total: number;
  commission_rate: number;
  commission: number;
  commission_gst: number;
  commission_total: number;
  partner_rate: number;
  partner_commission: number;
  partner_gst: number;
  partner_total: number;
  tcs_rate: number;
  tcs: number;
  tds_rate: number;
  tds: number;
  logistic_fee: number;
  logistic_gst: number;
  logistic_total: number;
  return_fee: number;
  reverse_logistic_gst: number;
  reverse_logistic_total: number;
  cancellation_fee: number;
  cancellation_gst: number;
  cancellation_total: number;
  claim_amount: number;
  taxes: number;
  settlement_amount: number;
  bank_settlement: number;
  payment: number;
  balance_amount: number;
  transaction_id?: string | null;
  payment_date?: string | null;
  status: VendorEarningStatus | "PAYMENT";
  delivered_at: string | null;
  unlock_at: string | null;
};

export type VendorPaymentsView = {
  cards: {
    /** Lifetime delivered sales GMV (not daily) */
    full_sale: number;
    /** Lifetime GST on sales */
    taxes: number;
    /** Lifetime marketplace commission on sales */
    lifetime_commission: number;
    lifetime_tcs: number;
    lifetime_tds: number;
    /** GST on today's delivered sales (daily reset) */
    gst: number;
    total_sale: number;
    commission: number;
    tcs: number;
    tds: number;
    /** Forward shipping fees (Easy Ship / self) */
    logistic_fee: number;
    return_fee: number;
    platform_fee: number;
    partner_commission: number;
    /**
     * Cumulative unlocked settlement (CREDITED + already withdrawn).
     * Pending unlocks into this after the delivery timer.
     */
    settlement_balance: number;
    /** Available to pay out = settlement_balance − withdrawn */
    balance: number;
    /** Available after delivery + unlock timer (CREDITED) */
    pending_payment: number;
    /** Still in the post-delivery unlock window */
    unlocking_payment: number;
    withdrawn: number;
  };
  settlements: VendorPaymentSettlement[];
  timezone: "Asia/Kolkata";
  unlock_minutes: number;
  as_of: string;
};

type VendorOrderLine = {
  inclusive_amount: number;
  gst_rate: number;
};

type VendorOrderEarning = {
  vendor_id: string;
  order_display_id: string | null;
  gross_amount: number;
  lines: VendorOrderLine[];
};

type LineQueryRow = {
  vendor_id: string;
  order_display_id: string | null;
  line_total: string | number;
  product_gst_rate: string | null;
  product_tax_code: string | null;
  item_gst_rate: string | null;
  item_tax_code: string | null;
};

let earningsTaxColumnsReady: Promise<void> | null = null;

/** Ensure marketplace tax + logistic fee columns exist (safe if migration already ran). */
export async function ensureVendorEarningsTaxColumns(pool: Pool): Promise<void> {
  if (!earningsTaxColumnsReady) {
    earningsTaxColumnsReady = pool
      .query(
        `
          ALTER TABLE vendor_earnings_log
            ADD COLUMN IF NOT EXISTS taxable_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS gst_rate numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tcs_rate numeric NOT NULL DEFAULT 0.5,
            ADD COLUMN IF NOT EXISTS tcs_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS tds_rate numeric NOT NULL DEFAULT 0.1,
            ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS logistic_fee numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS return_fee numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS platform_gst numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS partner_commission numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS partner_gst numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS commission_gst numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS logistic_gst numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS listing_gst numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS listing_total numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cancellation_fee numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS platform_fee_rate numeric NOT NULL DEFAULT 5,
            ADD COLUMN IF NOT EXISTS partner_commission_rate numeric NOT NULL DEFAULT 11
        `
      )
      .then(() => undefined)
      .catch((error) => {
        earningsTaxColumnsReady = null;
        throw error;
      });
  }
  await earningsTaxColumnsReady;
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Forward Easy Ship rate (or self dispatch rate) from order vendor workflow. */
export function resolveVendorLogisticFee(
  orderMetadata: Record<string, unknown> | null | undefined,
  vendorId: string
): number {
  const workflows = orderMetadata?.vendor_order_workflows;
  if (!workflows || typeof workflows !== "object" || Array.isArray(workflows)) return 0;
  const wf = (workflows as Record<string, any>)[vendorId] || {};
  // Easy Ship only — self ship has no platform logistic deduction
  if (wf.shipping_method === "easy") {
    return roundMoney(Math.max(0, Number(wf.easy_courier_rate) || 0));
  }
  return 0;
}

/** Return reverse courier rate from order vendor workflow. */
export function resolveVendorReturnFee(
  orderMetadata: Record<string, unknown> | null | undefined,
  vendorId: string
): number {
  const workflows = orderMetadata?.vendor_order_workflows;
  if (!workflows || typeof workflows !== "object" || Array.isArray(workflows)) return 0;
  const wf = (workflows as Record<string, any>)[vendorId] || {};
  return roundMoney(Math.max(0, Number(wf.return_courier_rate) || 0));
}

/**
 * True once a packet actually exists (courier booked / AWB / self already dispatched).
 * Customer cancel before this point must be ₹0 on the vendor ledger.
 */
export function isVendorPacketBooked(
  orderMetadata: Record<string, unknown> | null | undefined,
  vendorId: string
): boolean {
  const wf = getVendorWorkflow(orderMetadata, vendorId)
  if (wf.shiprocket_awb || wf.tracking_number || wf.self_awb) return true
  if (wf.admin_booked_at) return true
  const booking = String(wf.easy_booking_status || "").toLowerCase()
  if (booking === "booked") return true
  if (wf.shipping_method === "self") {
    const stage = String(wf.stage || "")
    return stage === "to_dispatch" || stage === "in_transit" || stage === "delivered"
  }
  return false
}

/**
 * When vendor selects a return courier, attach return_fee and recompute net
 * (if earnings row already exists for the order).
 */
export async function applyVendorReturnCourierFee(
  vendorId: string,
  orderId: string,
  returnFee: number,
  pool: Pool
): Promise<{ updated: boolean }> {
  await ensureVendorEarningsTaxColumns(pool);
  const fee = roundMoney(Math.max(0, returnFee));
  if (!vendorId || !orderId || fee <= 0) return { updated: false };

  const result = await pool.query(
    `
      UPDATE vendor_earnings_log
      SET return_fee = $3, updated_at = NOW()
      WHERE vendor_id = $1
        AND order_id = $2
        AND status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')
      RETURNING id
    `,
    [vendorId, orderId, fee]
  );

  if ((result.rowCount ?? 0) > 0) {
    await recomputeUnpaidVendorLedger(vendorId, pool, { orderId });
  }

  return { updated: (result.rowCount ?? 0) > 0 };
}

export async function recomputeUnpaidVendorLedger(
  vendorId: string,
  pool: Pool,
  options?: { orderId?: string; commissionRate?: number; platformRate?: number }
): Promise<number> {
  await ensureVendorEarningsTaxColumns(pool);
  // Live store TCS/TDS only as legacy fallback — prefer per-order snapshot.
  const taxRates = await getMarketplaceTaxRates(pool);

  const rows = await pool.query<{
    id: string;
    order_id: string;
    taxable_amount: string | number;
    gst_rate: string | number;
    logistic_fee: string | number;
    return_fee: string | number;
    cancellation_fee: string | number | null;
    commission_rate: string | number | null;
    platform_fee_rate: string | number | null;
  }>(
    `
      SELECT id, order_id, taxable_amount, gst_rate,
             COALESCE(logistic_fee, 0) AS logistic_fee,
             COALESCE(return_fee, 0) AS return_fee,
             COALESCE(cancellation_fee, 0) AS cancellation_fee,
             commission_rate,
             platform_fee_rate
      FROM vendor_earnings_log
      WHERE vendor_id = $1
        AND status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')
        AND order_id NOT LIKE 'claim:%'
        AND order_id NOT LIKE 'clawback:%'
        AND order_id NOT LIKE 'cancel-fee:%'
        ${options?.orderId ? "AND order_id = $2" : ""}
    `,
    options?.orderId ? [vendorId, options.orderId] : [vendorId]
  );

  const orderIds = [...new Set(rows.rows.map((r) => r.order_id).filter(Boolean))];
  const orderMetaById = new Map<string, Record<string, unknown> | null>();
  if (orderIds.length > 0) {
    const metaResult = await pool.query<{
      id: string;
      metadata: Record<string, unknown> | null;
    }>(`SELECT id, metadata FROM "order" WHERE id = ANY($1::text[])`, [orderIds]);
    for (const row of metaResult.rows) {
      orderMetaById.set(row.id, row.metadata || null);
    }
  }

  let updated = 0;
  for (const row of rows.rows) {
    let orderMeta = orderMetaById.get(row.order_id) || null;
    let snap = readOrderSettlementRates(orderMeta, vendorId);
    if (!snap) {
      snap = await getOrFreezeOrderSettlementRates({
        orderId: row.order_id,
        vendorId,
        pool,
        metadata: orderMeta,
      });
      const refreshed = await pool.query<{ metadata: Record<string, unknown> | null }>(
        `SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`,
        [row.order_id]
      );
      orderMeta = refreshed.rows[0]?.metadata || null;
      orderMetaById.set(row.order_id, orderMeta);
    }

    // Frozen order snapshot only — admin rate changes never rewrite these rows.
    const ledger = await ledgerForSaleRow({
      vendorId,
      itemPrice: Number(row.taxable_amount) || 0,
      logisticFee: Number(row.logistic_fee) || 0,
      returnFee: Number(row.return_fee) || 0,
      cancellationFee: Number(row.cancellation_fee) || 0,
      gstRate: Number(row.gst_rate) || 18,
      commissionRate: snap.commission_rate,
      tcsRate: snap.tcs_rate ?? taxRates.tcs_rate,
      tdsRate: snap.tds_rate ?? taxRates.tds_rate,
      platformRate: snap.platform_fee_rate,
      partnerRate: snap.partner_rate,
      serviceGstRate: snap.service_gst_rate,
      pool,
    });
    await pool.query(
      `
        UPDATE vendor_earnings_log SET
          commission_rate = $3,
          commission_amount = $4,
          tcs_amount = $5,
          tds_amount = $6,
          platform_fee = $7,
          platform_gst = $8,
          partner_commission = $9,
          partner_gst = $10,
          commission_gst = $11,
          logistic_gst = $12,
          listing_gst = $13,
          listing_total = $14,
          platform_fee_rate = $15,
          partner_commission_rate = $16,
          net_amount = $17,
          updated_at = NOW()
        WHERE id = $1 AND vendor_id = $2
          AND status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')
      `,
      [
        row.id,
        vendorId,
        ledger.commission_rate,
        Math.abs(ledger.commission_fee),
        Math.abs(ledger.tcs),
        Math.abs(ledger.tds),
        Math.abs(ledger.platform_fee),
        Math.abs(ledger.platform_gst),
        Math.abs(ledger.partner_commission),
        Math.abs(ledger.partner_gst),
        Math.abs(ledger.commission_gst),
        Math.abs(ledger.logistic_gst),
        Math.abs(ledger.listing_gst),
        Math.abs(ledger.listing_total),
        ledger.platform_rate,
        ledger.partner_rate,
        adminPayableNetFromLedger(ledger),
      ]
    );
    updated += 1;
  }
  return updated;
}

async function fetchVendorOrderEarnings(
  orderId: string,
  pool: Pool
): Promise<VendorOrderEarning[]> {
  const result = await pool.query<LineQueryRow>(
    `
      SELECT DISTINCT ON (oli.id)
        p.metadata->>'vendor_id' AS vendor_id,
        o.display_id::text AS order_display_id,
        (oli.unit_price::numeric) * GREATEST(COALESCE(oi.quantity, 1), 1) AS line_total,
        p.metadata->>'gst_rate' AS product_gst_rate,
        p.metadata->>'tax_code' AS product_tax_code,
        oli.metadata->>'gst_rate' AS item_gst_rate,
        oli.metadata->>'tax_code' AS item_tax_code
      FROM order_item oi
      JOIN order_line_item oli ON oi.item_id = oli.id
      JOIN "order" o ON oi.order_id = o.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
      WHERE oi.order_id = $1
        AND p.metadata->>'vendor_id' IS NOT NULL
        AND TRIM(p.metadata->>'vendor_id') <> ''
      ORDER BY oli.id
    `,
    [orderId]
  );

  const byVendor = new Map<string, VendorOrderEarning>();

  for (const row of result.rows) {
    const vendorId = String(row.vendor_id || "").trim();
    const lineTotal = Number(row.line_total) || 0;
    if (!vendorId || lineTotal <= 0) continue;

    const gstRate = parseLineGstRate(
      row.item_gst_rate ||
        row.item_tax_code ||
        row.product_gst_rate ||
        row.product_tax_code
    );

    const existing = byVendor.get(vendorId);
    if (existing) {
      existing.gross_amount += lineTotal;
      existing.lines.push({ inclusive_amount: lineTotal, gst_rate: gstRate });
    } else {
      byVendor.set(vendorId, {
        vendor_id: vendorId,
        order_display_id: row.order_display_id,
        gross_amount: lineTotal,
        lines: [{ inclusive_amount: lineTotal, gst_rate: gstRate }],
      });
    }
  }

  return Array.from(byVendor.values()).map((entry) => ({
    ...entry,
    gross_amount: Math.round(entry.gross_amount * 100) / 100,
  }));
}

export async function fetchVendorCommissionRate(
  vendorId: string,
  pool: Pool
): Promise<number> {
  const result = await pool.query<{
    commission_rate: string | number | null;
    commission_override: boolean | null;
  }>(
    `SELECT commission_rate, commission_override FROM vendor WHERE id = $1 LIMIT 1`,
    [vendorId]
  );
  const row = result.rows[0];
  const globalDefault = await getVendorCommissionDefaultRate(pool);
  return resolveVendorCommissionRate(
    {
      commission_rate:
        row?.commission_rate == null ? null : Number(row.commission_rate),
      commission_override: row?.commission_override === true,
    },
    globalDefault
  ).rate;
}

async function ledgerForSaleRow(params: {
  vendorId: string;
  itemPrice: number;
  logisticFee: number;
  returnFee?: number;
  cancellationFee?: number;
  gstRate: number;
  commissionRate: number;
  tcsRate: number;
  tdsRate: number;
  platformRate?: number;
  partnerRate?: number;
  serviceGstRate?: number;
  category?: "sale" | "return";
  pool: Pool;
}): Promise<LedgerSettlementBreakdown> {
  const rates = await buildLedgerRatesForVendor(params.vendorId, params.pool, {
    commission_rate: params.commissionRate,
    tcs_rate: params.tcsRate,
    tds_rate: params.tdsRate,
    output_gst_rate: params.gstRate,
    platform_rate: params.platformRate,
    partner_rate: params.partnerRate,
    service_gst_rate: params.serviceGstRate,
  });
  const category = params.category || "sale";
  const sale = calculateVendorLedgerSettlement({
    category,
    item_price: params.itemPrice,
    logistic_fee: params.logisticFee,
    reverse_logistic_fee: params.returnFee,
    cancellation_fee: params.cancellationFee,
    rates,
  });
  if (category === "sale") {
    return overlaySaleDeductions(
      sale,
      {
        reverse_logistic_fee: params.returnFee,
        cancellation_fee: params.cancellationFee,
      },
      rates
    );
  }
  return sale;
}

async function upsertVendorEarningRow(
  orderId: string,
  row: VendorOrderEarning,
  pool: Pool,
  deliveredAt: Date
): Promise<void> {
  await ensureVendorEarningsTaxColumns(pool);

  const orderMetaResult = await pool.query<{
    metadata: Record<string, unknown> | null;
  }>(`SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`, [orderId]);
  const orderMetadata = orderMetaResult.rows[0]?.metadata || null;

  const snap = await getOrFreezeOrderSettlementRates({
    orderId,
    vendorId: row.vendor_id,
    pool,
    metadata: orderMetadata,
  });

  const settlement = calculateMarketplaceSettlementFromLines(row.lines, {
    commission_rate: snap.commission_rate,
    tcs_rate: snap.tcs_rate,
    tds_rate: snap.tds_rate,
  });

  const logisticFee = resolveVendorLogisticFee(orderMetadata, row.vendor_id);
  const returnFee = resolveVendorReturnFee(orderMetadata, row.vendor_id);
  const ledger = await ledgerForSaleRow({
    vendorId: row.vendor_id,
    itemPrice: settlement.taxable_amount,
    logisticFee,
    returnFee,
    gstRate: settlement.gst_rate || 18,
    commissionRate: snap.commission_rate,
    tcsRate: snap.tcs_rate,
    tdsRate: snap.tds_rate,
    platformRate: snap.platform_fee_rate,
    partnerRate: snap.partner_rate,
    serviceGstRate: snap.service_gst_rate,
    pool,
  });
  const netAfterFees = adminPayableNetFromLedger(ledger);

  const unlockAt = new Date(
    deliveredAt.getTime() + VENDOR_EARNINGS_UNLOCK_MINUTES * 60 * 1000
  );

  await pool.query(
    `
      INSERT INTO vendor_earnings_log (
        id,
        vendor_id,
        order_id,
        order_display_id,
        gross_amount,
        taxable_amount,
        gst_amount,
        gst_rate,
        commission_rate,
        commission_amount,
        tcs_rate,
        tcs_amount,
        tds_rate,
        tds_amount,
        logistic_fee,
        return_fee,
        platform_fee,
        platform_gst,
        partner_commission,
        partner_gst,
        commission_gst,
        logistic_gst,
        listing_gst,
        listing_total,
        cancellation_fee,
        platform_fee_rate,
        partner_commission_rate,
        net_amount,
        currency_code,
        status,
        delivered_at,
        unlock_at,
        created_at,
        updated_at
      ) VALUES (
        've_' || substr(md5($1 || ':' || $2), 1, 24),
        $2, $1, $3,
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
        'inr',
        'UNLOCKING',
        $28,
        $29,
        NOW(),
        NOW()
      )
      ON CONFLICT (vendor_id, order_id) DO UPDATE SET
        gross_amount = EXCLUDED.gross_amount,
        taxable_amount = EXCLUDED.taxable_amount,
        gst_amount = EXCLUDED.gst_amount,
        gst_rate = EXCLUDED.gst_rate,
        commission_rate = EXCLUDED.commission_rate,
        commission_amount = EXCLUDED.commission_amount,
        tcs_rate = EXCLUDED.tcs_rate,
        tcs_amount = EXCLUDED.tcs_amount,
        tds_rate = EXCLUDED.tds_rate,
        tds_amount = EXCLUDED.tds_amount,
        logistic_fee = GREATEST(COALESCE(vendor_earnings_log.logistic_fee, 0), EXCLUDED.logistic_fee),
        return_fee = GREATEST(COALESCE(vendor_earnings_log.return_fee, 0), EXCLUDED.return_fee),
        platform_fee = EXCLUDED.platform_fee,
        platform_gst = EXCLUDED.platform_gst,
        partner_commission = EXCLUDED.partner_commission,
        partner_gst = EXCLUDED.partner_gst,
        commission_gst = EXCLUDED.commission_gst,
        logistic_gst = EXCLUDED.logistic_gst,
        listing_gst = EXCLUDED.listing_gst,
        listing_total = EXCLUDED.listing_total,
        cancellation_fee = EXCLUDED.cancellation_fee,
        platform_fee_rate = EXCLUDED.platform_fee_rate,
        partner_commission_rate = EXCLUDED.partner_commission_rate,
        net_amount = EXCLUDED.net_amount,
        delivered_at = COALESCE(vendor_earnings_log.delivered_at, EXCLUDED.delivered_at),
        unlock_at = COALESCE(vendor_earnings_log.unlock_at, EXCLUDED.unlock_at),
        status = CASE
          WHEN vendor_earnings_log.status IN ('CREDITED', 'PAID', 'REVERSED', 'ON_HOLD')
            THEN vendor_earnings_log.status
          ELSE 'UNLOCKING'
        END,
        updated_at = NOW()
      WHERE vendor_earnings_log.status NOT IN ('CREDITED', 'PAID', 'REVERSED', 'ON_HOLD')
    `,
    [
      orderId,
      row.vendor_id,
      row.order_display_id,
      settlement.inclusive_amount,
      settlement.taxable_amount,
      settlement.gst_amount,
      settlement.gst_rate,
      ledger.commission_rate,
      Math.abs(ledger.commission_fee),
      settlement.tcs_rate,
      Math.abs(ledger.tcs),
      settlement.tds_rate,
      Math.abs(ledger.tds),
      logisticFee,
      returnFee,
      Math.abs(ledger.platform_fee),
      Math.abs(ledger.platform_gst),
      Math.abs(ledger.partner_commission),
      Math.abs(ledger.partner_gst),
      Math.abs(ledger.commission_gst),
      Math.abs(ledger.logistic_gst),
      Math.abs(ledger.listing_gst),
      Math.abs(ledger.listing_total),
      Math.abs(ledger.cancellation_fee),
      ledger.platform_rate,
      ledger.partner_rate,
      netAfterFees,
      deliveredAt.toISOString(),
      unlockAt.toISOString(),
    ]
  );
}

/** Normalize optional vendor scope for delivery earnings. */
export function normalizeDeliveryVendorScope(options?: {
  vendorId?: string | null;
  vendorIds?: string[] | null;
}): string[] {
  const ids = [
    ...(options?.vendorId ? [String(options.vendorId)] : []),
    ...((options?.vendorIds || []).map((id) => String(id || ""))),
  ]
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * When a vendor's shipment is delivered, create (or refresh) that vendor's
 * earnings row with a 5-minute unlock timer.
 *
 * IMPORTANT: Always pass `vendorId` / `vendorIds`. Without a vendor scope this
 * refuses to credit anyone — multi-vendor carts must not unlock sibling vendors
 * when only one package is delivered.
 */
export async function scheduleVendorEarningsOnDelivery(
  orderId: string,
  pool: Pool,
  options?: {
    deliveredAt?: Date;
    vendorId?: string | null;
    vendorIds?: string[] | null;
  }
): Promise<{ scheduled: number; vendors: string[]; skipped_unscoped?: boolean }> {
  const scope = normalizeDeliveryVendorScope(options);
  if (scope.length === 0) {
    console.warn(
      `[vendor-earnings] refusing unscoped delivery earnings for order ${orderId} (pass vendorId)`
    );
    return { scheduled: 0, vendors: [], skipped_unscoped: true };
  }

  const allowed = new Set(scope);
  const rows = (await fetchVendorOrderEarnings(orderId, pool)).filter((row) =>
    allowed.has(row.vendor_id)
  );
  if (rows.length === 0) {
    return { scheduled: 0, vendors: [] };
  }

  const deliveredAt = options?.deliveredAt ?? new Date();
  const vendors: string[] = [];

  for (const row of rows) {
    await upsertVendorEarningRow(orderId, row, pool, deliveredAt);
    vendors.push(row.vendor_id);
  }

  return { scheduled: rows.length, vendors };
}

/**
 * Backfill earnings for delivered orders that pre-date the payout unlock feature
 * or missed the delivery webhook.
 */
export async function backfillVendorEarnings(
  vendorId: string,
  pool: Pool
): Promise<number> {
  const missing = await pool.query<{ order_id: string; delivered_at: string }>(
    `
      SELECT DISTINCT ON (o.id)
        o.id AS order_id,
        f.delivered_at
      FROM "order" o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN order_line_item oli ON oi.item_id = oli.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
      JOIN order_fulfillment ofu ON ofu.order_id = o.id
      JOIN fulfillment f ON f.id = ofu.fulfillment_id
      LEFT JOIN vendor_earnings_log vel
        ON vel.order_id = o.id
       AND vel.vendor_id = $1
      WHERE p.metadata->>'vendor_id' = $1
        AND f.delivered_at IS NOT NULL
        AND vel.id IS NULL
      ORDER BY o.id, f.delivered_at DESC
    `,
    [vendorId]
  );

  let created = 0;

  for (const row of missing.rows) {
    const earnings = await fetchVendorOrderEarnings(row.order_id, pool);
    const vendorRow = earnings.find((entry) => entry.vendor_id === vendorId);
    if (!vendorRow) continue;

    await upsertVendorEarningRow(
      row.order_id,
      vendorRow,
      pool,
      new Date(row.delivered_at)
    );
    created += 1;
  }

  return created;
}

/** Promote UNLOCKING rows to CREDITED once the 5-minute timer has elapsed. */
export async function syncVendorEarningsStatuses(pool: Pool): Promise<number> {
  // Cancel/return used to store negative nets — normalize so available balance never goes negative.
  await pool.query(
    `
      UPDATE vendor_earnings_log
      SET
        net_amount = 0,
        updated_at = NOW()
      WHERE status = 'REVERSED'
        AND net_amount < 0
    `
  );

  // Keep unlock paused only for vendors whose items are on a pending return
  await pool.query(
    `
      UPDATE vendor_earnings_log vel
      SET
        status = 'ON_HOLD',
        unlock_at = NULL,
        credited_at = NULL,
        updated_at = NOW()
      WHERE vel.status IN ('UNLOCKING', 'CREDITED')
        AND EXISTS (
          SELECT 1
          FROM return_request rr
          JOIN return_request_item rri
            ON rri.return_request_id = rr.id
           AND rri.deleted_at IS NULL
          LEFT JOIN order_line_item oli ON oli.id = rri.order_item_id
          LEFT JOIN order_item oi
            ON oi.id = rri.order_item_id OR oi.item_id = rri.order_item_id
          LEFT JOIN order_line_item oli2 ON oli2.id = oi.item_id
          LEFT JOIN product_variant pv
            ON pv.id = COALESCE(oli.variant_id, oli2.variant_id)
          LEFT JOIN product p
            ON p.id = COALESCE(oli.product_id, oli2.product_id, pv.product_id)
          WHERE rr.order_id = vel.order_id
            AND rr.status = 'pending_approval'
            AND rr.deleted_at IS NULL
            AND TRIM(p.metadata->>'vendor_id') = vel.vendor_id
        )
    `
  );

  const result = await pool.query(
    `
      UPDATE vendor_earnings_log
      SET
        status = 'CREDITED',
        credited_at = COALESCE(credited_at, NOW()),
        updated_at = NOW()
      WHERE status = 'UNLOCKING'
        AND unlock_at IS NOT NULL
        AND unlock_at <= NOW()
      RETURNING id
    `
  );

  return result.rowCount ?? 0;
}

/**
 * Vendors whose products appear on a return request (via return_request_item → product).
 * Used so hold/reverse/credit never touch sibling vendors on multi-vendor carts.
 */
export async function listVendorIdsForReturnRequest(
  pool: Pool,
  returnRequestId: string
): Promise<string[]> {
  if (!returnRequestId) return [];
  const result = await pool.query<{ vendor_id: string | null }>(
    `
      SELECT DISTINCT TRIM(p.metadata->>'vendor_id') AS vendor_id
      FROM return_request_item rri
      LEFT JOIN order_line_item oli ON oli.id = rri.order_item_id
      LEFT JOIN order_item oi
        ON oi.id = rri.order_item_id OR oi.item_id = rri.order_item_id
      LEFT JOIN order_line_item oli2 ON oli2.id = oi.item_id
      LEFT JOIN product_variant pv
        ON pv.id = COALESCE(oli.variant_id, oli2.variant_id)
      LEFT JOIN product p
        ON p.id = COALESCE(oli.product_id, oli2.product_id, pv.product_id)
      WHERE rri.return_request_id = $1
        AND rri.deleted_at IS NULL
        AND p.metadata->>'vendor_id' IS NOT NULL
        AND TRIM(p.metadata->>'vendor_id') <> ''
    `,
    [returnRequestId]
  );
  return [
    ...new Set(
      result.rows
        .map((row) => String(row.vendor_id || "").trim())
        .filter(Boolean)
    ),
  ];
}

function normalizeVendorScope(options?: {
  vendorId?: string | null;
  vendorIds?: string[] | null;
}): string[] {
  return [
    ...new Set(
      [
        ...(options?.vendorId ? [String(options.vendorId)] : []),
        ...((options?.vendorIds || []).map((id) => String(id || ""))),
      ]
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Pause the 5-minute unlock (and pull out of Pending Payment) while a return
 * waits for admin confirmation. Always pass vendorIds for the returned items.
 */
export async function holdVendorEarningsForReturn(
  orderId: string,
  pool: Pool,
  options?: { vendorId?: string | null; vendorIds?: string[] | null }
): Promise<{ held: number; skipped: boolean; skipped_unscoped?: boolean }> {
  if (!orderId) return { held: 0, skipped: true };

  const vendorIds = normalizeVendorScope(options);
  if (vendorIds.length === 0) {
    console.warn(
      `[vendor-earnings] refusing unscoped return hold for order ${orderId}`
    );
    return { held: 0, skipped: true, skipped_unscoped: true };
  }

  const result = await pool.query<{ id: string }>(
    `
      UPDATE vendor_earnings_log
      SET
        status = 'ON_HOLD',
        unlock_at = NULL,
        credited_at = NULL,
        updated_at = NOW()
      WHERE order_id = $1
        AND vendor_id = ANY($2::text[])
        AND status IN ('UNLOCKING', 'CREDITED')
      RETURNING id
    `,
    [orderId, vendorIds]
  );

  const held = result.rowCount ?? 0;
  if (held > 0) {
    console.log(
      `[vendor-earnings] held ${held} row(s) for order ${orderId} vendors=${vendorIds.join(",")}`
    );
  }

  return { held, skipped: held === 0 };
}

/**
 * Admin rejected the return — credit settlement to Pending Payment immediately.
 * Only releases vendors that were held for this return.
 */
export async function creditVendorEarningsAfterReturnRejected(
  orderId: string,
  pool: Pool,
  options?: { vendorId?: string | null; vendorIds?: string[] | null }
): Promise<{ credited: number; skipped: boolean; skipped_unscoped?: boolean }> {
  if (!orderId) return { credited: 0, skipped: true };

  const vendorIds = normalizeVendorScope(options);
  if (vendorIds.length === 0) {
    console.warn(
      `[vendor-earnings] refusing unscoped return credit for order ${orderId}`
    );
    return { credited: 0, skipped: true, skipped_unscoped: true };
  }

  const result = await pool.query<{ id: string }>(
    `
      UPDATE vendor_earnings_log
      SET
        status = 'CREDITED',
        credited_at = COALESCE(credited_at, NOW()),
        unlock_at = NULL,
        updated_at = NOW()
      WHERE order_id = $1
        AND vendor_id = ANY($2::text[])
        AND status = 'ON_HOLD'
      RETURNING id
    `,
    [orderId, vendorIds]
  );

  const credited = result.rowCount ?? 0;
  if (credited > 0) {
    console.log(
      `[vendor-earnings] credited ${credited} row(s) for order ${orderId} (return rejected) vendors=${vendorIds.join(",")}`
    );
  }

  return { credited, skipped: credited === 0 };
}

/**
 * CREDITED debit for the fixed cancellation charge (fee + service GST).
 * Hits available/payable balance — unlike stamping cancellation_fee on REVERSED net=0.
 * Works for pre-delivery cancels (no earnings row) and post-delivery reverses.
 */
async function insertCancelFeeDebitsForOrder(
  orderId: string,
  pool: Pool,
  vendorIds: string[],
  options?: {
    /** Vendors already known from reverse/paid rows */
    knownVendors?: Array<{ vendor_id: string; order_display_id?: string | null }>;
    orderMetadata?: Record<string, unknown> | null;
  }
): Promise<number> {
  await ensureVendorEarningsTaxColumns(pool);

  const known = new Map<string, string | null>();
  for (const row of options?.knownVendors || []) {
    if (row.vendor_id) known.set(row.vendor_id, row.order_display_id || null);
  }

  // Pre-delivery cancel: no earnings rows — resolve vendors from order line items.
  if (known.size === 0) {
    const fromOrder = await fetchVendorOrderEarnings(orderId, pool);
    for (const row of fromOrder) {
      if (!row.vendor_id) continue;
      if (vendorIds.length > 0 && !vendorIds.includes(row.vendor_id)) continue;
      known.set(row.vendor_id, row.order_display_id || null);
    }
  } else if (vendorIds.length > 0) {
    for (const id of [...known.keys()]) {
      if (!vendorIds.includes(id)) known.delete(id);
    }
  }

  if (known.size === 0) return 0;

  let orderMetadata = options?.orderMetadata ?? null;
  if (!orderMetadata) {
    const metaResult = await pool.query<{
      metadata: Record<string, unknown> | null;
      display_id: string | number | null;
    }>(`SELECT metadata, display_id::text AS display_id FROM "order" WHERE id = $1 LIMIT 1`, [
      orderId,
    ]);
    orderMetadata = metaResult.rows[0]?.metadata || null;
    const displayId = metaResult.rows[0]?.display_id
      ? String(metaResult.rows[0].display_id)
      : null;
    if (displayId) {
      for (const [vid, existing] of known) {
        if (!existing) known.set(vid, displayId);
      }
    }
  }

  let insertedCount = 0;
  const now = new Date().toISOString();

  for (const [vendorId, displayId] of known) {
    if (!isVendorPacketBooked(orderMetadata, vendorId)) {
      console.log(
        `[vendor-earnings] skip cancel charges for ${vendorId} order ${orderId}: packet not booked`
      );
      continue;
    }

    const snap = await getOrFreezeOrderSettlementRates({
      orderId,
      vendorId,
      pool,
      metadata: orderMetadata,
    });
    const fee = roundMoney(Number(snap.cancellation_charge) || 0);
    const saleAlreadyHasLogistics = options?.knownVendors?.some(
      (row) => row.vendor_id === vendorId
    );
    const logistic = saleAlreadyHasLogistics
      ? 0
      : resolveVendorLogisticFee(orderMetadata, vendorId);
    if (fee <= 0 && logistic <= 0) continue;

    const ledger = calculateVendorLedgerSettlement({
      category: "cancellation",
      item_price: 0,
      logistic_fee: logistic,
      cancellation_fee: fee,
      rates: {
        platform_rate: snap.platform_fee_rate,
        commission_rate: snap.commission_rate,
        partner_rate: snap.partner_rate,
        output_gst_rate: 18,
        service_gst_rate: snap.service_gst_rate,
        tcs_rate: snap.tcs_rate,
        tds_rate: snap.tds_rate,
      },
    });
    const debit = roundMoney(Number(ledger.balance_delta) || 0);
    if (debit >= 0) continue;

    const syntheticOrderId = `cancel-fee:${orderId}`;
    const label = displayId ? `CANCEL-${displayId}` : `CANCEL-${orderId.slice(-6)}`;

    const inserted = await pool.query(
      `
        INSERT INTO vendor_earnings_log (
          id,
          vendor_id,
          order_id,
          order_display_id,
          gross_amount,
          taxable_amount,
          gst_amount,
          gst_rate,
          commission_rate,
          commission_amount,
          tcs_rate,
          tcs_amount,
          tds_rate,
          tds_amount,
          logistic_fee,
          return_fee,
          cancellation_fee,
          net_amount,
          currency_code,
          status,
          delivered_at,
          unlock_at,
          credited_at,
          created_at,
          updated_at
        ) VALUES (
          've_' || substr(md5($1 || ':' || $2 || ':cancel-fee'), 1, 24),
          $2,
          $1,
          $3,
          $4,
          0,
          $5,
          $6,
          0,
          0,
          0,
          0,
          0,
          0,
          $8,
          0,
          $7,
          $4,
          'inr',
          'CREDITED',
          $9,
          NULL,
          $9,
          NOW(),
          NOW()
        )
        ON CONFLICT (vendor_id, order_id) DO NOTHING
        RETURNING id
      `,
      [
        syntheticOrderId,
        vendorId,
        label,
        debit,
        Math.abs(Number(ledger.cancellation_gst) || 0),
        snap.service_gst_rate,
        fee,
        logistic,
        now,
      ]
    );

    if ((inserted.rowCount ?? 0) > 0) {
      insertedCount += 1;
      console.log(
        `[vendor-earnings] cancel-fee debit ${debit} (fee ${fee}, logistic ${logistic}) for vendor ${vendorId} order ${orderId}`
      );
    }
  }

  return insertedCount;
}

/**
 * Claw back settlement that was already paid out (status=PAID).
 * Leaves the PAID row intact for audit and inserts a CREDITED debit
 * (`clawback:<orderId>`) so the amount is deducted from the next payout.
 */
async function insertPaidClawbacksForOrder(
  orderId: string,
  pool: Pool,
  reason: string,
  vendorIds: string[]
): Promise<number> {
  await ensureVendorEarningsTaxColumns(pool);

  const paid =
    vendorIds.length > 0
      ? await pool.query<{
          vendor_id: string;
          net_amount: string | number;
          order_display_id: string | null;
        }>(
          `
            SELECT vendor_id, net_amount, order_display_id
            FROM vendor_earnings_log
            WHERE order_id = $1
              AND vendor_id = ANY($2::text[])
              AND status = 'PAID'
              AND COALESCE(net_amount, 0) > 0
          `,
          [orderId, vendorIds]
        )
      : await pool.query<{
          vendor_id: string;
          net_amount: string | number;
          order_display_id: string | null;
        }>(
          `
            SELECT vendor_id, net_amount, order_display_id
            FROM vendor_earnings_log
            WHERE order_id = $1
              AND status = 'PAID'
              AND COALESCE(net_amount, 0) > 0
          `,
          [orderId]
        );

  let clawed = 0;
  const now = new Date().toISOString();
  const label = /cancel/i.test(reason) ? "CANCEL" : "RETURN";

  for (const row of paid.rows) {
    const paidNet = roundMoney(Number(row.net_amount) || 0);
    if (paidNet <= 0) continue;
    const syntheticOrderId = `clawback:${orderId}`;
    const displayId = row.order_display_id
      ? `${label}-${row.order_display_id}`
      : `${label}-${orderId.slice(-6)}`;
    const debit = -paidNet;

    const inserted = await pool.query(
      `
        INSERT INTO vendor_earnings_log (
          id,
          vendor_id,
          order_id,
          order_display_id,
          gross_amount,
          taxable_amount,
          gst_amount,
          gst_rate,
          commission_rate,
          commission_amount,
          tcs_rate,
          tcs_amount,
          tds_rate,
          tds_amount,
          logistic_fee,
          return_fee,
          cancellation_fee,
          net_amount,
          currency_code,
          status,
          delivered_at,
          unlock_at,
          credited_at,
          created_at,
          updated_at
        ) VALUES (
          've_' || substr(md5($1 || ':' || $2 || ':clawback'), 1, 24),
          $2,
          $1,
          $3,
          $4,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          $4,
          'inr',
          'CREDITED',
          $5,
          NULL,
          $5,
          NOW(),
          NOW()
        )
        ON CONFLICT (vendor_id, order_id) DO NOTHING
        RETURNING id
      `,
      [syntheticOrderId, row.vendor_id, displayId, debit, now]
    );

    if ((inserted.rowCount ?? 0) > 0) {
      clawed += 1;
      console.log(
        `[vendor-earnings] PAID clawback ${debit} for vendor ${row.vendor_id} order ${orderId} (${reason})`
      );
    }
  }

  return clawed;
}

/**
 * Reverse vendor earnings when an order is returned/cancelled/refunded.
 * Status becomes REVERSED and net credit is cleared to 0 (not a negative balance).
 * Already-PAID rows are clawed back via a separate CREDITED debit (next payout).
 *
 * - Full order cancel: omit vendorIds → reverse every vendor on the order.
 * - Return approve: pass vendorIds for returned items only (required via vendorScoped).
 */
export async function reverseVendorEarningsForOrder(
  orderId: string,
  pool: Pool,
  reason = "return",
  options?: {
    vendorId?: string | null;
    vendorIds?: string[] | null;
    /** When true, do nothing if vendor scope is empty (return flows). */
    vendorScoped?: boolean;
  }
): Promise<{
  reversed: number;
  clawed_back: number;
  cancel_fees: number;
  skipped: boolean;
  skipped_unscoped?: boolean;
}> {
  if (!orderId) {
    return { reversed: 0, clawed_back: 0, cancel_fees: 0, skipped: true };
  }

  const vendorIds = normalizeVendorScope(options);
  if (options?.vendorScoped && vendorIds.length === 0) {
    console.warn(
      `[vendor-earnings] refusing unscoped reverse for order ${orderId} (${reason})`
    );
    return {
      reversed: 0,
      clawed_back: 0,
      cancel_fees: 0,
      skipped: true,
      skipped_unscoped: true,
    };
  }

  const applyCancelCharge = /cancel/i.test(reason);
  const result =
    vendorIds.length > 0
      ? await pool.query<{
          id: string;
          vendor_id: string;
          order_display_id: string | null;
        }>(
          `
            UPDATE vendor_earnings_log
            SET
              status = 'REVERSED',
              net_amount = 0,
              cancellation_fee = 0,
              credited_at = NULL,
              unlock_at = NULL,
              updated_at = NOW()
            WHERE order_id = $1
              AND vendor_id = ANY($2::text[])
              AND status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')
            RETURNING id, vendor_id, order_display_id
          `,
          [orderId, vendorIds]
        )
      : await pool.query<{
          id: string;
          vendor_id: string;
          order_display_id: string | null;
        }>(
          `
            UPDATE vendor_earnings_log
            SET
              status = 'REVERSED',
              net_amount = 0,
              cancellation_fee = 0,
              credited_at = NULL,
              unlock_at = NULL,
              updated_at = NOW()
            WHERE order_id = $1
              AND status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')
            RETURNING id, vendor_id, order_display_id
          `,
          [orderId]
        );

  const clawedBack = await insertPaidClawbacksForOrder(
    orderId,
    pool,
    reason,
    vendorIds
  );

  const isReturn = /return/i.test(reason);
  if (isReturn && (result.rowCount ?? 0) > 0) {
    const metaResult = await pool.query<{
      metadata: Record<string, unknown> | null;
    }>(`SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`, [orderId]);
    const orderMetadata = metaResult.rows[0]?.metadata || null;
    const vendors = [...new Set(result.rows.map((row) => row.vendor_id))];
    for (const vendorId of vendors) {
      const returnFee = resolveVendorReturnFee(orderMetadata, vendorId);
      if (returnFee <= 0) continue;
      await pool.query(
        `
          UPDATE vendor_earnings_log
          SET return_fee = GREATEST(COALESCE(return_fee, 0), $3),
              updated_at = NOW()
          WHERE order_id = $1 AND vendor_id = $2
        `,
        [orderId, vendorId, returnFee]
      );
    }
  }

  let cancelFees = 0;
  if (applyCancelCharge) {
    const orderMetaResult = await pool.query<{
      metadata: Record<string, unknown> | null;
    }>(`SELECT metadata FROM "order" WHERE id = $1 LIMIT 1`, [orderId]);
    const orderMetadata = orderMetaResult.rows[0]?.metadata || null;

    const knownVendors = result.rows.map((row) => ({
      vendor_id: row.vendor_id,
      order_display_id: row.order_display_id,
    }));
    // Also cover PAID-only vendors (reversed list empty for them).
    if (vendorIds.length > 0) {
      const paidVendors = await pool.query<{
        vendor_id: string;
        order_display_id: string | null;
      }>(
        `
          SELECT DISTINCT vendor_id, order_display_id
          FROM vendor_earnings_log
          WHERE order_id = $1
            AND vendor_id = ANY($2::text[])
            AND status = 'PAID'
        `,
        [orderId, vendorIds]
      );
      for (const row of paidVendors.rows) {
        if (!knownVendors.some((k) => k.vendor_id === row.vendor_id)) {
          knownVendors.push(row);
        }
      }
    } else {
      const paidVendors = await pool.query<{
        vendor_id: string;
        order_display_id: string | null;
      }>(
        `
          SELECT DISTINCT vendor_id, order_display_id
          FROM vendor_earnings_log
          WHERE order_id = $1
            AND status = 'PAID'
        `,
        [orderId]
      );
      for (const row of paidVendors.rows) {
        if (!knownVendors.some((k) => k.vendor_id === row.vendor_id)) {
          knownVendors.push(row);
        }
      }
    }

    cancelFees = await insertCancelFeeDebitsForOrder(orderId, pool, vendorIds, {
      knownVendors,
      orderMetadata,
    });
  }

  const reversed = result.rowCount ?? 0;
  if (reversed > 0) {
    console.log(`[vendor-earnings] reversed ${reversed} row(s) for order ${orderId} (${reason})`);
  }

  return {
    reversed,
    clawed_back: clawedBack,
    cancel_fees: cancelFees,
    skipped: reversed === 0 && clawedBack === 0 && cancelFees === 0,
  };
}

/**
 * Credit vendor pending payment for an approved claim (partial settlement).
 * Uses synthetic order_id `claim:<reportId>` so it doesn't collide with order earnings.
 * Amount is CREDITED immediately (no 5-min unlock).
 */
export async function upsertVendorClaimCredit(
  vendorId: string,
  claimId: string,
  amount: number,
  pool: Pool,
  options?: {
    order_display_id?: string | null
    claim_title?: string | null
  }
): Promise<{ credited: boolean; order_id: string; net_amount: number }> {
  await ensureVendorEarningsTaxColumns(pool);
  const net = roundMoney(Math.max(0, amount));
  const syntheticOrderId = `claim:${claimId}`;
  if (!vendorId || !claimId || net <= 0) {
    return { credited: false, order_id: syntheticOrderId, net_amount: 0 };
  }

  const displayId = options?.order_display_id
    ? `CLAIM-${options.order_display_id}`
    : `CLAIM-${claimId.slice(-6)}`;
  const now = new Date().toISOString();

  await pool.query(
    `
      INSERT INTO vendor_earnings_log (
        id,
        vendor_id,
        order_id,
        order_display_id,
        gross_amount,
        taxable_amount,
        gst_amount,
        gst_rate,
        commission_rate,
        commission_amount,
        tcs_rate,
        tcs_amount,
        tds_rate,
        tds_amount,
        logistic_fee,
        return_fee,
        net_amount,
        currency_code,
        status,
        delivered_at,
        unlock_at,
        credited_at,
        created_at,
        updated_at
      ) VALUES (
        've_' || substr(md5($1 || ':' || $2), 1, 24),
        $2,
        $1,
        $3,
        $4,
        $4,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        $4,
        'inr',
        'CREDITED',
        $5,
        NULL,
        $5,
        NOW(),
        NOW()
      )
      ON CONFLICT (vendor_id, order_id) DO UPDATE SET
        gross_amount = EXCLUDED.gross_amount,
        taxable_amount = EXCLUDED.taxable_amount,
        commission_rate = 0,
        commission_amount = 0,
        tcs_amount = 0,
        tds_amount = 0,
        net_amount = EXCLUDED.net_amount,
        order_display_id = COALESCE(EXCLUDED.order_display_id, vendor_earnings_log.order_display_id),
        status = CASE
          WHEN vendor_earnings_log.status = 'PAID' THEN 'PAID'
          ELSE 'CREDITED'
        END,
        credited_at = COALESCE(vendor_earnings_log.credited_at, EXCLUDED.credited_at),
        delivered_at = COALESCE(vendor_earnings_log.delivered_at, EXCLUDED.delivered_at),
        updated_at = NOW()
      WHERE vendor_earnings_log.status <> 'PAID'
    `,
    [syntheticOrderId, vendorId, displayId, net, now]
  );

  console.log(
    `[vendor-earnings] claim credit ${net} for vendor ${vendorId} (${syntheticOrderId})`
  );

  return { credited: true, order_id: syntheticOrderId, net_amount: net };
}

/** Normalize payout order id lists from JSON / CSV / arrays. */
export function normalizePayoutOrderIds(orderIds?: unknown): string[] {
  if (Array.isArray(orderIds)) {
    return [
      ...new Set(
        orderIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      ),
    ];
  }
  if (typeof orderIds === "string" && orderIds.trim()) {
    try {
      const parsed = JSON.parse(orderIds);
      if (Array.isArray(parsed)) return normalizePayoutOrderIds(parsed);
    } catch {
      // fall through to CSV
    }
    return [
      ...new Set(
        orderIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ];
  }
  return [];
}

/**
 * Mark CREDITED earnings as PAID after a payout is confirmed.
 * Requires explicit order_ids — never marks all CREDITED rows for a vendor.
 */
export async function markVendorEarningsAsPaid(
  vendorId: string,
  pool: Pool,
  orderIds: string[]
): Promise<number> {
  const ids = normalizePayoutOrderIds(orderIds);
  if (!vendorId || ids.length === 0) {
    throw new Error(
      "order_ids are required to mark earnings as PAID (refusing to mark all CREDITED rows)"
    );
  }

  const result = await pool.query(
    `
      UPDATE vendor_earnings_log
      SET
        status = 'PAID',
        updated_at = NOW()
      WHERE vendor_id = $1
        AND status = 'CREDITED'
        AND order_id = ANY($2::text[])
      RETURNING id
    `,
    [vendorId, ids]
  );

  return result.rowCount ?? 0;
}

/** Razorpay statuses that mean money has settled to the vendor. */
export function isRazorpayPayoutSettled(status: unknown): boolean {
  return String(status || "")
    .trim()
    .toLowerCase() === "processed";
}

/**
 * Orders already attached to an in-flight or completed payout must not be paid again.
 */
export async function listOrderIdsAlreadyOnPayout(
  pool: Pool,
  vendorId: string,
  orderIds: string[],
  options?: { excludePayoutId?: string | null }
): Promise<string[]> {
  const ids = normalizePayoutOrderIds(orderIds);
  if (!vendorId || ids.length === 0) return [];

  const result = await pool.query<{ order_ids: unknown }>(
    `
      SELECT order_ids
      FROM vendor_payout
      WHERE vendor_id = $1
        AND lower(coalesce(status, '')) IN (
          'pending', 'queued', 'processing', 'processed', 'completed', 'paid'
        )
        ${options?.excludePayoutId ? "AND id <> $2" : ""}
    `,
    options?.excludePayoutId
      ? [vendorId, options.excludePayoutId]
      : [vendorId]
  );

  const claimed = new Set<string>();
  for (const row of result.rows) {
    for (const orderId of normalizePayoutOrderIds(row.order_ids)) {
      claimed.add(orderId);
    }
  }
  return ids.filter((id) => claimed.has(id));
}

/** Payable snapshot for admin payout screen (CREDITED only — not still unlocking).
 * Pass `effectiveRate` to re-apply commission on stored taxable amounts
 * (earnings rows may still hold an older commission rate).
 */
/**
 * Claim credits are admin-approved payouts — never apply commission / TCS / TDS.
 * Restores any rows that were wrongly reduced (e.g. 680 → 659.6 at 3%).
 */
export async function repairClaimCreditsWithoutCommission(
  vendorId: string,
  pool: Pool
): Promise<void> {
  await pool.query(
    `
      UPDATE vendor_earnings_log
      SET
        commission_rate = 0,
        commission_amount = 0,
        tcs_amount = 0,
        tds_amount = 0,
        net_amount = GREATEST(COALESCE(gross_amount, 0), COALESCE(taxable_amount, 0), COALESCE(net_amount, 0)),
        taxable_amount = GREATEST(COALESCE(gross_amount, 0), COALESCE(taxable_amount, 0), COALESCE(net_amount, 0)),
        updated_at = NOW()
      WHERE vendor_id = $1
        AND order_id LIKE 'claim:%'
        AND status IN ('CREDITED', 'UNLOCKING', 'ON_HOLD')
        AND (
          COALESCE(commission_amount, 0) > 0
          OR COALESCE(net_amount, 0) + 0.001 < COALESCE(gross_amount, 0)
        )
    `,
    [vendorId]
  );
}

export type VendorPayableLineItem = {
  id: string;
  order_id: string;
  order_display_id: string | null;
  product_name: string;
  type: "sales" | "claim" | "cancellation" | "clawback";
  order_amount: number;
  commission: number;
  tcs: number;
  tds: number;
  /** Easy Ship courier fee deducted from settlement; 0 for self / claims */
  logistic_fee: number;
  /** Amount admin pays for this line (settlement / net) */
  pay_amount: number;
};

export async function getVendorPayableSnapshot(
  vendorId: string,
  pool: Pool,
  _options?: { effectiveRate?: number }
): Promise<{
  vendor_id: string;
  total_revenue: number;
  commission: number;
  tcs: number;
  tds: number;
  logistic_fee: number;
  net_amount: number;
  commission_rate: number;
  order_count: number;
  order_ids: string[];
  line_items: VendorPayableLineItem[];
  unlocking_balance: number;
  unlocking_count: number;
  available_balance: number;
}> {
  await ensureVendorEarningsTaxColumns(pool);
  await syncVendorEarningsStatuses(pool);
  await repairClaimCreditsWithoutCommission(vendorId, pool);
  // Recompute unpaid rows from frozen per-order snapshots only (never live admin rates).
  await recomputeUnpaidVendorLedger(vendorId, pool);

  const credited = await pool.query<{
    id: string;
    order_id: string;
    order_display_id: string | null;
    gross_amount: string | number;
    taxable_amount: string | number;
    commission_amount: string | number;
    tcs_amount: string | number;
    tds_amount: string | number;
    tcs_rate: string | number;
    tds_rate: string | number;
    logistic_fee: string | number;
    return_fee: string | number;
    net_amount: string | number;
    commission_rate: string | number;
    product_name: string | null;
    claim_title: string | null;
  }>(
    `
      SELECT
        vel.id,
        vel.order_id,
        vel.order_display_id,
        vel.gross_amount,
        vel.taxable_amount,
        vel.commission_amount,
        vel.tcs_amount,
        vel.tds_amount,
        vel.tcs_rate,
        vel.tds_rate,
        COALESCE(vel.logistic_fee, 0) AS logistic_fee,
        COALESCE(vel.return_fee, 0) AS return_fee,
        vel.net_amount,
        vel.commission_rate,
        CASE
          WHEN vel.order_id LIKE 'claim:%' THEN COALESCE(
            (
              SELECT NULLIF(TRIM(vr.issue_title), '')
              FROM vendor_report vr
              WHERE vr.id = SUBSTRING(vel.order_id FROM 7)
              LIMIT 1
            ),
            'Claim settlement'
          )
          ELSE (
            SELECT COALESCE(oli.title, 'Order #' || COALESCE(vel.order_display_id, LEFT(vel.order_id, 8)))
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            LEFT JOIN product_variant pv ON oli.variant_id = pv.id
            LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
            WHERE oi.order_id = vel.order_id
              AND p.metadata->>'vendor_id' = $1
            ORDER BY oli.id
            LIMIT 1
          )
        END AS product_name,
        CASE
          WHEN vel.order_id LIKE 'claim:%' THEN (
            SELECT NULLIF(TRIM(vr.issue_title), '')
            FROM vendor_report vr
            WHERE vr.id = SUBSTRING(vel.order_id FROM 7)
            LIMIT 1
          )
          ELSE NULL
        END AS claim_title
      FROM vendor_earnings_log vel
      WHERE vel.vendor_id = $1
        AND vel.status = 'CREDITED'
        AND (
          vel.gross_amount > 0
          OR vel.net_amount <> 0
          OR vel.order_id LIKE 'claim:%'
          OR vel.order_id LIKE 'clawback:%'
          OR vel.order_id LIKE 'cancel-fee:%'
        )
      ORDER BY vel.credited_at ASC NULLS LAST
    `,
    [vendorId]
  );

  const unlocking = await pool.query<{ cnt: string; balance: string }>(
    `
      SELECT
        COUNT(*)::text AS cnt,
        COALESCE(SUM(net_amount), 0)::text AS balance
      FROM vendor_earnings_log
      WHERE vendor_id = $1
        AND status = 'UNLOCKING'
    `,
    [vendorId]
  );

  let totalRevenue = 0;
  let commission = 0;
  let tcs = 0;
  let tds = 0;
  let logisticFeeTotal = 0;
  let netAmount = 0;
  let commissionRate = 2;
  const orderIds: string[] = [];
  const lineItems: VendorPayableLineItem[] = [];

  for (const row of credited.rows) {
    const orderIdKey = String(row.order_id || "");
    const isClaim = orderIdKey.startsWith("claim:");
    const isClawback = orderIdKey.startsWith("clawback:");
    const isCancelFee = orderIdKey.startsWith("cancel-fee:");
    const gross = Number(row.gross_amount) || 0;
    const rowNetRaw = Number(row.net_amount) || 0;

    // Debit rows (cancel fee / PAID clawback) reduce payable net.
    if (isCancelFee || isClawback) {
      if (rowNetRaw === 0) continue;
      netAmount += rowNetRaw;
      if (row.order_id) orderIds.push(row.order_id);
      lineItems.push({
        id: row.id,
        order_id: row.order_id,
        order_display_id: row.order_display_id,
        product_name: isCancelFee
          ? "Cancellation charge"
          : "Paid clawback (return/cancel)",
        type: isCancelFee ? "cancellation" : "clawback",
        order_amount: rowNetRaw,
        commission: 0,
        tcs: 0,
        tds: 0,
        logistic_fee: 0,
        pay_amount: rowNetRaw,
      });
      continue;
    }

    if (gross <= 0 && rowNetRaw <= 0) continue;
    // Claims credit net_amount; sales use gross for revenue totals
    if (!isClaim && gross <= 0) continue;

    const taxable = Number(row.taxable_amount) || 0;
    const rowTcs = isClaim ? 0 : Number(row.tcs_amount) || 0;
    const rowTds = isClaim ? 0 : Number(row.tds_amount) || 0;
    const rowLogistic = isClaim ? 0 : Number(row.logistic_fee) || 0;
    const rowCommission = isClaim ? 0 : Number(row.commission_amount) || 0;
    const rowNet = isClaim
      ? Math.max(gross, rowNetRaw, taxable)
      : rowNetRaw;

    if (!isClaim) {
      commissionRate = Number(row.commission_rate) || commissionRate;
    }

    if (!isClaim) {
      totalRevenue += gross;
      commission += rowCommission;
      tcs += rowTcs;
      tds += rowTds;
      logisticFeeTotal += rowLogistic;
    }
    netAmount += rowNet;
    if (row.order_id) orderIds.push(row.order_id);

    const productName =
      row.product_name?.trim() ||
      row.claim_title?.trim() ||
      (isClaim
        ? "Claim settlement"
        : formatOrderFallback(row.order_display_id, row.order_id));

    lineItems.push({
      id: row.id,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      product_name: productName,
      type: isClaim ? "claim" : "sales",
      order_amount: isClaim ? rowNet : gross,
      commission: isClaim ? 0 : rowCommission,
      tcs: isClaim ? 0 : rowTcs,
      tds: isClaim ? 0 : rowTds,
      logistic_fee: rowLogistic,
      pay_amount: rowNet,
    });
  }

  return {
    vendor_id: vendorId,
    total_revenue: totalRevenue,
    commission,
    tcs,
    tds,
    logistic_fee: logisticFeeTotal,
    net_amount: netAmount,
    commission_rate: commissionRate,
    order_count: orderIds.length,
    order_ids: orderIds,
    line_items: lineItems,
    unlocking_balance: Number(unlocking.rows[0]?.balance) || 0,
    unlocking_count: Number(unlocking.rows[0]?.cnt) || 0,
    available_balance: netAmount,
  };
}

/** Same status set as Payments ledger payout SELECT — keep dashboard cards in sync. */
export const VENDOR_PAYOUT_WITHDRAWN_STATUSES = [
  "processed",
  "completed",
  "paid",
] as const;

async function fetchTotalWithdrawn(vendorId: string, pool: Pool): Promise<number> {
  try {
    const result = await pool.query(
      `
        SELECT COALESCE(SUM(net_amount), 0) AS total_withdrawn
        FROM vendor_payout
        WHERE vendor_id = $1
          AND lower(coalesce(status, '')) = ANY($2::text[])
      `,
      [vendorId, [...VENDOR_PAYOUT_WITHDRAWN_STATUSES]]
    );
    return Number(result.rows[0]?.total_withdrawn) || 0;
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError?.code === "42P01") {
      return 0;
    }
    throw error;
  }
}

export async function getVendorEarningsSummary(
  vendorId: string,
  pool: Pool
): Promise<VendorEarningsSummary> {
  await syncVendorEarningsStatuses(pool);

  const [unlockingResult, balancesResult, creditedRecentResult, reversedRecentResult, totalWithdrawn] =
    await Promise.all([
      pool.query(
        `
          SELECT
            id,
            order_id,
            order_display_id,
            net_amount,
            gross_amount,
            commission_rate,
            commission_amount,
            unlock_at,
            delivered_at
          FROM vendor_earnings_log
          WHERE vendor_id = $1
            AND status = 'UNLOCKING'
          ORDER BY unlock_at ASC
        `,
        [vendorId]
      ),
      pool.query(
        `
          SELECT
            COALESCE(SUM(CASE WHEN status = 'CREDITED' THEN net_amount ELSE 0 END), 0) AS credited_positive,
            COALESCE(SUM(CASE WHEN status = 'UNLOCKING' THEN net_amount ELSE 0 END), 0) AS unlocking_balance,
            COALESCE(SUM(CASE WHEN status = 'CREDITED' THEN net_amount ELSE 0 END), 0) AS available_balance,
            COALESCE(SUM(CASE WHEN status IN ('CREDITED', 'PAID') THEN net_amount ELSE 0 END), 0) AS total_credited,
            COALESCE(SUM(CASE WHEN status = 'REVERSED' THEN ABS(gross_amount - commission_amount) ELSE 0 END), 0) AS reversed_total
          FROM vendor_earnings_log
          WHERE vendor_id = $1
        `,
        [vendorId]
      ),
      pool.query(
        `
          SELECT
            id,
            order_id,
            order_display_id,
            net_amount,
            gross_amount,
            commission_rate,
            commission_amount,
            credited_at
          FROM vendor_earnings_log
          WHERE vendor_id = $1
            AND status = 'CREDITED'
          ORDER BY credited_at DESC NULLS LAST, updated_at DESC
          LIMIT 10
        `,
        [vendorId]
      ),
      pool.query(
        `
          SELECT id, order_id, order_display_id, net_amount, updated_at AS reversed_at
          FROM vendor_earnings_log
          WHERE vendor_id = $1
            AND status = 'REVERSED'
          ORDER BY updated_at DESC
          LIMIT 10
        `,
        [vendorId]
      ),
      fetchTotalWithdrawn(vendorId, pool),
    ]);

  const balances = balancesResult.rows[0] ?? {};

  return {
    available_balance: Number(balances.available_balance) || 0,
    unlocking_balance: Number(balances.unlocking_balance) || 0,
    total_credited: Number(balances.total_credited) || 0,
    reversed_total: Number(balances.reversed_total) || 0,
    total_withdrawn: totalWithdrawn,
    unlocking: unlockingResult.rows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      net_amount: Number(row.net_amount) || 0,
      gross_amount: Number(row.gross_amount) || 0,
      commission_rate: Number(row.commission_rate) || 0,
      commission_amount: Number(row.commission_amount) || 0,
      unlock_at: row.unlock_at,
      delivered_at: row.delivered_at,
    })),
    credited_recent: creditedRecentResult.rows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      net_amount: Number(row.net_amount) || 0,
      gross_amount: Number(row.gross_amount) || 0,
      commission_rate: Number(row.commission_rate) || 0,
      commission_amount: Number(row.commission_amount) || 0,
      credited_at: row.credited_at,
    })),
    reversed_recent: reversedRecentResult.rows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      net_amount: Number(row.net_amount) || 0,
      reversed_at: row.reversed_at,
    })),
  };
}

export async function getVendorEarningsByOrderIds(
  vendorId: string,
  orderIds: string[],
  pool: Pool
): Promise<Record<string, VendorEarningRow | undefined>> {
  if (orderIds.length === 0) return {};

  await syncVendorEarningsStatuses(pool);

  const result = await pool.query<VendorEarningRow>(
    `
      SELECT *
      FROM vendor_earnings_log
      WHERE vendor_id = $1
        AND order_id = ANY($2::text[])
    `,
    [vendorId, orderIds]
  );

  const map: Record<string, VendorEarningRow | undefined> = {};
  for (const row of result.rows) {
    map[row.order_id] = {
      ...row,
      gross_amount: Number(row.gross_amount) || 0,
      commission_rate: Number(row.commission_rate) || 0,
      commission_amount: Number(row.commission_amount) || 0,
      net_amount: Number(row.net_amount) || 0,
    };
  }
  return map;
}

type SettlementEarningRow = {
  id: string;
  order_id: string;
  order_display_id: string | null;
  status: VendorEarningStatus;
  gross_amount: string | number;
  taxable_amount: string | number;
  gst_amount: string | number;
  gst_rate: string | number;
  commission_rate: string | number;
  commission_amount: string | number;
  tcs_rate: string | number;
  tcs_amount: string | number;
  tds_rate: string | number;
  tds_amount: string | number;
  logistic_fee: string | number;
  return_fee: string | number;
  net_amount: string | number;
  delivered_at: string | null;
  unlock_at: string | null;
  product_name: string | null;
};

export function formatOrderFallback(
  orderDisplayId: string | null,
  orderId: string
): string {
  if (orderDisplayId) {
    return `Order #${orderDisplayId}`;
  }
  return `Order #${orderId.slice(0, 8)}`;
}

function itemStatusLabel(
  category: LedgerCategory,
  status: VendorEarningStatus | "PAYMENT"
): string {
  if (category === "return") return "Returned"
  if (category === "claim") return "Claim credited"
  if (category === "payment") return "Paid out"
  if (category === "cancellation") return "Cancelled"
  if (status === "PAID") return "Delivered · Paid"
  if (status === "UNLOCKING") return "Unlocking"
  if (status === "ON_HOLD") return "Return hold"
  return "Delivered"
}

export function settlementFromLedger(params: {
  id: string
  order_id: string
  order_display_id: string | null
  product_name: string
  status: VendorEarningStatus | "PAYMENT"
  delivered_at: string | null
  unlock_at: string | null
  ledger: LedgerSettlementBreakdown
  tcs_rate: number
  tds_rate: number
  gst_rate: number
  transaction_id?: string | null
  payment_date?: string | null
}): VendorPaymentSettlement {
  const { ledger } = params
  const type =
    ledger.category === "sale"
      ? "sales"
      : ledger.category === "return"
        ? "return"
        : ledger.category === "claim"
          ? "claim"
          : ledger.category === "cancellation"
            ? "cancellation"
            : "payment"
  return {
    id: params.id,
    order_id: params.order_id,
    order_display_id: params.order_display_id,
    product_name: params.product_name,
    type,
    category: ledger.category,
    order_date: params.delivered_at,
    invoice_no: params.order_display_id ? `INV-${params.order_display_id}` : "",
    item_status: itemStatusLabel(ledger.category, params.status),
    order_amount: ledger.item_price + ledger.listing_gst,
    taxable_amount: ledger.item_price,
    gst_amount: ledger.listing_gst,
    gst_rate: params.gst_rate,
    listing_gst: ledger.listing_gst,
    listing_total: ledger.listing_total,
    platform_rate: ledger.platform_rate,
    platform_fee: ledger.platform_fee,
    platform_gst: ledger.platform_gst,
    platform_total: ledger.platform_total,
    commission_rate: ledger.commission_rate,
    commission: ledger.commission_fee,
    commission_gst: ledger.commission_gst,
    commission_total: ledger.commission_total,
    partner_rate: ledger.partner_rate,
    partner_commission: ledger.partner_commission,
    partner_gst: ledger.partner_gst,
    partner_total: ledger.partner_total,
    tcs_rate: params.tcs_rate,
    tcs: ledger.tcs,
    tds_rate: params.tds_rate,
    tds: ledger.tds,
    logistic_fee: ledger.logistic_fee,
    logistic_gst: ledger.logistic_gst,
    logistic_total: ledger.logistic_total,
    return_fee: ledger.reverse_logistic_fee,
    reverse_logistic_gst: ledger.reverse_logistic_gst,
    reverse_logistic_total: ledger.reverse_logistic_total,
    cancellation_fee: ledger.cancellation_fee,
    cancellation_gst: ledger.cancellation_gst,
    cancellation_total: ledger.cancellation_total,
    claim_amount: ledger.claim_amount,
    taxes: ledger.listing_gst,
    settlement_amount: ledger.bank_settlement,
    bank_settlement: ledger.bank_settlement,
    payment: ledger.payment,
    balance_amount: 0,
    transaction_id: params.transaction_id || null,
    payment_date: params.payment_date || null,
    status: params.status,
    delivered_at: params.delivered_at,
    unlock_at: params.unlock_at,
  }
}
