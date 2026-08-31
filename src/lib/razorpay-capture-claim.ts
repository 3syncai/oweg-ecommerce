import { Pool } from "pg";

function createPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

async function ensureClaimTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS razorpay_capture_claim (
      razorpay_payment_id TEXT PRIMARY KEY,
      medusa_order_id TEXT NULL,
      status TEXT NOT NULL DEFAULT 'claimed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS razorpay_capture_claim_order_idx
      ON razorpay_capture_claim (medusa_order_id)
  `);
}

export type CaptureClaim = {
  razorpay_payment_id: string;
  medusa_order_id: string | null;
  status: string;
};

export type ClaimAcquireResult =
  | { role: "winner" }
  | { role: "follower"; medusaOrderId: string | null };

/**
 * Under advisory lock: ensure at most one rebuild winner per razorpay_payment_id.
 * Winner creates the Medusa order outside this short transaction; followers wait/reuse.
 */
export async function acquireCaptureClaim(
  razorpayPaymentId: string
): Promise<ClaimAcquireResult | null> {
  const pool = createPool();
  if (!pool || !razorpayPaymentId) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS razorpay_capture_claim (
        razorpay_payment_id TEXT PRIMARY KEY,
        medusa_order_id TEXT NULL,
        status TEXT NOT NULL DEFAULT 'claimed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `rzp_capture:${razorpayPaymentId}`,
    ]);

    const existing = await client.query(
      `SELECT razorpay_payment_id, medusa_order_id, status, updated_at
       FROM razorpay_capture_claim WHERE razorpay_payment_id = $1 FOR UPDATE`,
      [razorpayPaymentId]
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      const orderId = row.medusa_order_id ? String(row.medusa_order_id) : null;
      if (orderId) {
        await client.query("COMMIT");
        return { role: "follower", medusaOrderId: orderId };
      }

      // Abandoned claim (no order after 20s) — reclaim as winner.
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      const ageMs = Date.now() - updatedAt;
      if (ageMs < 20_000) {
        await client.query("COMMIT");
        return { role: "follower", medusaOrderId: null };
      }

      await client.query(
        `UPDATE razorpay_capture_claim
         SET status = 'claimed', updated_at = NOW()
         WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      await client.query("COMMIT");
      return { role: "winner" };
    }

    await client.query(
      `INSERT INTO razorpay_capture_claim (razorpay_payment_id, status, created_at, updated_at)
       VALUES ($1, 'claimed', NOW(), NOW())`,
      [razorpayPaymentId]
    );
    await client.query("COMMIT");
    return { role: "winner" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("acquireCaptureClaim failed", razorpayPaymentId, err);
    return null;
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

export async function setCaptureClaimOrder(
  razorpayPaymentId: string,
  medusaOrderId: string,
  status: "claimed" | "placed" = "placed"
): Promise<void> {
  const pool = createPool();
  if (!pool) return;
  try {
    await ensureClaimTable(pool);
    await pool.query(
      `INSERT INTO razorpay_capture_claim (razorpay_payment_id, medusa_order_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (razorpay_payment_id) DO UPDATE SET
         medusa_order_id = EXCLUDED.medusa_order_id,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [razorpayPaymentId, medusaOrderId, status]
    );
  } catch (err) {
    console.warn("setCaptureClaimOrder failed", err);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function getCaptureClaim(
  razorpayPaymentId: string
): Promise<CaptureClaim | null> {
  const pool = createPool();
  if (!pool || !razorpayPaymentId) return null;
  try {
    await ensureClaimTable(pool);
    const res = await pool.query(
      `SELECT razorpay_payment_id, medusa_order_id, status
       FROM razorpay_capture_claim WHERE razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    if (!res.rows[0]) return null;
    return {
      razorpay_payment_id: String(res.rows[0].razorpay_payment_id),
      medusa_order_id: res.rows[0].medusa_order_id
        ? String(res.rows[0].medusa_order_id)
        : null,
      status: String(res.rows[0].status || "claimed"),
    };
  } catch (err) {
    console.warn("getCaptureClaim failed", err);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Poll until claim has medusa_order_id or timeout. */
export async function waitForCaptureClaimOrder(
  razorpayPaymentId: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const intervalMs = opts?.intervalMs ?? 200;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const claim = await getCaptureClaim(razorpayPaymentId);
    if (claim?.medusa_order_id) return claim.medusa_order_id;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
