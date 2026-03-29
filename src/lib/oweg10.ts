import crypto from "crypto";
import { adminFetch } from "@/lib/medusa-admin";
import { getPool } from "@/lib/wallet-ledger";
import {OWEG10_CODE } from "@/lib/oweg10-shared";
const RESERVATION_TTL_MINUTES = 15;

type CouponUsageRow = {
  status: "pending" | "consumed";
  reservation_token: string | null;
  order_id: string | null;
  expires_at: string | null;
  consumed_at: string | null;
};

let ensureTablePromise: Promise<void> | null = null;

async function ensureCouponUsageTable() {
  if (!ensureTablePromise) {
    const pool = getPool();
    ensureTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS customer_coupon_usage (
          id BIGSERIAL PRIMARY KEY,
          customer_id TEXT NOT NULL,
          coupon_code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          reservation_token TEXT NULL,
          order_id TEXT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          expires_at TIMESTAMPTZ NULL,
          consumed_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT customer_coupon_usage_status_chk CHECK (status IN ('pending', 'consumed'))
        );
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS IDX_customer_coupon_usage_customer_code
        ON customer_coupon_usage (customer_id, coupon_code);
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS IDX_customer_coupon_usage_reservation
        ON customer_coupon_usage (reservation_token)
        WHERE reservation_token IS NOT NULL;
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS IDX_customer_coupon_usage_order
        ON customer_coupon_usage (order_id)
        WHERE order_id IS NOT NULL;
      `);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  await ensureTablePromise;
}

async function cleanupExpiredReservations(customerId?: string) {
  await ensureCouponUsageTable();
  const pool = getPool();
  if (customerId) {
    await pool.query(
      `
        DELETE FROM customer_coupon_usage
        WHERE status = 'pending'
          AND coupon_code = $1
          AND customer_id = $2
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      `,
      [OWEG10_CODE, customerId]
    );
    return;
  }

  await pool.query(`
    DELETE FROM customer_coupon_usage
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  `);
}

export async function getOweg10Status(customerId: string) {
  if (!customerId) {
    return {
      consumed: false,
      pending: false,
      orderId: null as string | null,
      expiresAt: null as string | null,
    };
  }

  await cleanupExpiredReservations(customerId);
  const pool = getPool();
  const result = await pool.query<CouponUsageRow>(
    `
      SELECT status, reservation_token, order_id, expires_at, consumed_at
      FROM customer_coupon_usage
      WHERE customer_id = $1 AND coupon_code = $2
      LIMIT 1
    `,
    [customerId, OWEG10_CODE]
  );

  const row = result.rows[0];
  return {
    consumed: row?.status === "consumed",
    pending: row?.status === "pending",
    orderId: row?.order_id || null,
    expiresAt: row?.expires_at || null,
  };
}

export async function reserveOweg10(customerId: string) {
  if (!customerId) {
    return { ok: false as const, reason: "invalid" as const };
  }

  await ensureCouponUsageTable();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        DELETE FROM customer_coupon_usage
        WHERE status = 'pending'
          AND coupon_code = $1
          AND customer_id = $2
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      `,
      [OWEG10_CODE, customerId]
    );

    const existing = await client.query<CouponUsageRow>(
      `
        SELECT status, reservation_token, order_id, expires_at, consumed_at
        FROM customer_coupon_usage
        WHERE customer_id = $1 AND coupon_code = $2
        LIMIT 1
        FOR UPDATE
      `,
      [customerId, OWEG10_CODE]
    );

    const reservationToken = crypto.randomUUID();

    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.status === "consumed") {
        await client.query("COMMIT");
        return { ok: false as const, reason: "consumed" as const };
      }
      if (row.status === "pending" && row.expires_at) {
        await client.query("COMMIT");
        return { ok: false as const, reason: "pending" as const };
      }
      await client.query(
        `
          UPDATE customer_coupon_usage
          SET status = 'pending',
              reservation_token = $3,
              order_id = NULL,
              metadata = '{}'::jsonb,
              expires_at = NOW() + ($4 || ' minutes')::interval,
              consumed_at = NULL,
              updated_at = NOW()
          WHERE customer_id = $1 AND coupon_code = $2
        `,
        [customerId, OWEG10_CODE, reservationToken, String(RESERVATION_TTL_MINUTES)]
      );
    } else {
      await client.query(
        `
          INSERT INTO customer_coupon_usage (
            customer_id,
            coupon_code,
            status,
            reservation_token,
            expires_at,
            metadata
          )
          VALUES (
            $1,
            $2,
            'pending',
            $3,
            NOW() + ($4 || ' minutes')::interval,
            '{}'::jsonb
          )
        `,
        [customerId, OWEG10_CODE, reservationToken, String(RESERVATION_TTL_MINUTES)]
      );
    }

    await client.query("COMMIT");
    return { ok: true as const, reservationToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseOweg10Reservation(customerId: string, reservationToken: string) {
  if (!customerId || !reservationToken) return;
  await ensureCouponUsageTable();
  const pool = getPool();
  await pool.query(
    `
      DELETE FROM customer_coupon_usage
      WHERE customer_id = $1
        AND coupon_code = $2
        AND reservation_token = $3
        AND status = 'pending'
    `,
    [customerId, OWEG10_CODE, reservationToken]
  );
}

export async function consumeOweg10Reservation(options: {
  customerId: string;
  reservationToken: string;
  orderId: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureCouponUsageTable();
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE customer_coupon_usage
      SET status = 'consumed',
          order_id = $3,
          metadata = COALESCE($4::jsonb, '{}'::jsonb),
          expires_at = NULL,
          consumed_at = NOW(),
          updated_at = NOW()
      WHERE customer_id = $1
        AND coupon_code = $2
        AND reservation_token = $5
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at >= NOW()
      RETURNING order_id
    `,
    [
      options.customerId,
      OWEG10_CODE,
      options.orderId,
      JSON.stringify(options.metadata || {}),
      options.reservationToken,
    ]
  );

  if (result.rows[0]) {
    return { ok: true as const };
  }

  const status = await getOweg10Status(options.customerId);
  if (status.consumed) {
    return { ok: false as const, reason: "consumed" as const };
  }

  return { ok: false as const, reason: "expired" as const };
}

export async function syncOweg10ConsumedCustomerMetadata(customerId: string) {
  if (!customerId) return;
  try {
    const customerRes = await adminFetch<{ customer?: { metadata?: Record<string, unknown> } }>(
      `/admin/customers/${encodeURIComponent(customerId)}`
    );
    const existingMetadata = customerRes.data?.customer?.metadata || {};
    if (existingMetadata.oweg10_consumed === true) return;

    await adminFetch(`/admin/customers/${encodeURIComponent(customerId)}`, {
      method: "POST",
      body: JSON.stringify({
        metadata: {
          ...existingMetadata,
          oweg10_consumed: true,
        },
      }),
    });
  } catch (error) {
    console.warn("oweg10 metadata sync failed", error);
  }
}
