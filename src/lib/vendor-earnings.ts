import type { Pool } from "pg";
import {
  calculateMarketplaceSettlementFromLines,
  getMarketplaceTaxRates,
  parseLineGstRate,
} from "./vendor-marketplace-tax";

export const VENDOR_EARNINGS_UNLOCK_MINUTES = 5;

export type VendorEarningStatus = "UNLOCKING" | "CREDITED" | "PAID" | "REVERSED";

export type VendorEarningRow = {
  id: string;
  vendor_id: string;
  order_id: string;
  order_display_id: string | null;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
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
    unlock_at: string;
    delivered_at: string | null;
  }>;
  credited_recent: Array<{
    id: string;
    order_id: string;
    order_display_id: string | null;
    net_amount: number;
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

async function ensureVendorEarningsTaxColumns(pool: Pool): Promise<void> {
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
            ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0
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

async function fetchVendorCommissionRate(
  vendorId: string,
  pool: Pool
): Promise<number> {
  const result = await pool.query<{ commission_rate: string | number | null }>(
    `SELECT commission_rate FROM vendor WHERE id = $1 LIMIT 1`,
    [vendorId]
  );
  const rate = Number(result.rows[0]?.commission_rate);
  return Number.isFinite(rate) ? rate : 2;
}

async function upsertVendorEarningRow(
  orderId: string,
  row: VendorOrderEarning,
  pool: Pool,
  deliveredAt: Date
): Promise<void> {
  await ensureVendorEarningsTaxColumns(pool);

  const [commissionRate, taxRates] = await Promise.all([
    fetchVendorCommissionRate(row.vendor_id, pool),
    getMarketplaceTaxRates(pool),
  ]);
  const settlement = calculateMarketplaceSettlementFromLines(row.lines, {
    commission_rate: commissionRate,
    tcs_rate: taxRates.tcs_rate,
    tds_rate: taxRates.tds_rate,
  });

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
        net_amount,
        currency_code,
        status,
        delivered_at,
        unlock_at,
        created_at,
        updated_at
      ) VALUES (
        've_' || substr(md5($1 || ':' || $2), 1, 24),
        $2,
        $1,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        'inr',
        'UNLOCKING',
        $15,
        $16,
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
        net_amount = EXCLUDED.net_amount,
        delivered_at = COALESCE(vendor_earnings_log.delivered_at, EXCLUDED.delivered_at),
        unlock_at = COALESCE(vendor_earnings_log.unlock_at, EXCLUDED.unlock_at),
        status = CASE
          WHEN vendor_earnings_log.status IN ('CREDITED', 'PAID', 'REVERSED') THEN vendor_earnings_log.status
          ELSE 'UNLOCKING'
        END,
        updated_at = NOW()
      WHERE vendor_earnings_log.status NOT IN ('CREDITED', 'PAID', 'REVERSED')
    `,
    [
      orderId,
      row.vendor_id,
      row.order_display_id,
      settlement.inclusive_amount,
      settlement.taxable_amount,
      settlement.gst_amount,
      settlement.gst_rate,
      settlement.commission_rate,
      settlement.commission_amount,
      settlement.tcs_rate,
      settlement.tcs_amount,
      settlement.tds_rate,
      settlement.tds_amount,
      settlement.net_amount,
      deliveredAt.toISOString(),
      unlockAt.toISOString(),
    ]
  );
}

/**
 * When an order is delivered, create (or refresh) vendor earnings rows with a
 * 5-minute unlock timer before the amount becomes available for payout.
 */
export async function scheduleVendorEarningsOnDelivery(
  orderId: string,
  pool: Pool,
  options?: { deliveredAt?: Date }
): Promise<{ scheduled: number; vendors: string[] }> {
  const rows = await fetchVendorOrderEarnings(orderId, pool);
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
 * Reverse vendor earnings when an order is returned/cancelled/refunded.
 * Status becomes REVERSED and net credit is cleared to 0 (not a negative balance).
 */
export async function reverseVendorEarningsForOrder(
  orderId: string,
  pool: Pool,
  reason = "return"
): Promise<{ reversed: number; skipped: boolean }> {
  if (!orderId) return { reversed: 0, skipped: true };

  const result = await pool.query<{ id: string }>(
    `
      UPDATE vendor_earnings_log
      SET
        status = 'REVERSED',
        net_amount = 0,
        credited_at = NULL,
        unlock_at = NULL,
        updated_at = NOW()
      WHERE order_id = $1
        AND status IN ('UNLOCKING', 'CREDITED')
      RETURNING id
    `,
    [orderId]
  );

  const reversed = result.rowCount ?? 0;
  if (reversed > 0) {
    console.log(`[vendor-earnings] reversed ${reversed} row(s) for order ${orderId} (${reason})`);
  }

  return { reversed, skipped: reversed === 0 };
}

async function fetchTotalWithdrawn(vendorId: string, pool: Pool): Promise<number> {
  try {
    const result = await pool.query(
      `
        SELECT COALESCE(SUM(net_amount), 0) AS total_withdrawn
        FROM vendor_payout
        WHERE vendor_id = $1
          AND status = 'processed'
      `,
      [vendorId]
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
          SELECT id, order_id, order_display_id, net_amount, credited_at
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
      unlock_at: row.unlock_at,
      delivered_at: row.delivered_at,
    })),
    credited_recent: creditedRecentResult.rows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      net_amount: Number(row.net_amount) || 0,
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

  await backfillVendorEarnings(vendorId, pool);
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
