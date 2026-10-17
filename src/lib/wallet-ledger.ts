import { Pool, PoolClient } from "pg";
import { heldCoins } from "@/lib/payment-reliability";

export type LedgerType = "EARN" | "SPEND" | "REVERSE";

export type LedgerEntry = {
  id: number;
  customer_id: string;
  order_id: string | null;
  type: LedgerType;
  amount: number; // signed, minor units
  reference_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const DATABASE_URL = process.env.DATABASE_URL;

let sharedPool: Pool | null = null;

export function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured");
  }
  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: DATABASE_URL });
  }
  return sharedPool;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function ensureAccount(client: PoolClient, customerId: string) {
  await client.query(
    `INSERT INTO wallet_account (customer_id, actual_balance)
     VALUES ($1, 0)
     ON CONFLICT (customer_id) DO NOTHING`,
    [customerId]
  );
  const res = await client.query(
    `SELECT customer_id, actual_balance
     FROM wallet_account
     WHERE customer_id = $1
     FOR UPDATE`,
    [customerId]
  );
  if (!res.rows[0]) {
    throw new Error("Failed to load wallet account");
  }
  return {
    customer_id: res.rows[0].customer_id as string,
    actual_balance: Number(res.rows[0].actual_balance || 0),
  };
}

async function reconcileAccountBalance(client: PoolClient, customerId: string) {
  const account = await ensureAccount(client, customerId);
  const ledgerRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS ledger_sum
     FROM wallet_ledger
     WHERE customer_id = $1`,
    [customerId]
  );
  const ledgerSum = Number(ledgerRes.rows[0]?.ledger_sum || 0);
  if (ledgerSum !== Number(account.actual_balance || 0)) {
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [ledgerSum, customerId]
    );
    return ledgerSum;
  }
  return Number(account.actual_balance || 0);
}

async function insertLedgerEntry(
  client: PoolClient,
  entry: Omit<LedgerEntry, "id" | "created_at" | "metadata"> & {
    metadata?: Record<string, unknown>;
  }
) {
  if (entry.idempotency_key) {
    const existing = await client.query(
      `SELECT id FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
      [entry.idempotency_key]
    );
    if (existing.rows[0]) return undefined;
  }

  if (entry.order_id && entry.type === "EARN") {
    const existingEarn = await client.query(
      `SELECT id FROM wallet_ledger WHERE order_id = $1 AND type = 'EARN' LIMIT 1`,
      [entry.order_id]
    );
    if (existingEarn.rows[0]) return undefined;
  }

  const res = await client.query(
    `INSERT INTO wallet_ledger
       (customer_id, order_id, type, amount, reference_id, idempotency_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      entry.customer_id,
      entry.order_id || null,
      entry.type,
      entry.amount,
      entry.reference_id || null,
      entry.idempotency_key || null,
      entry.metadata ? JSON.stringify(entry.metadata) : "{}",
    ]
  );
  return res.rows[0]?.id as number | undefined;
}

export async function ensureWalletLedgerIndexes() {
  const pool = getPool();
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_uq
      ON wallet_ledger (idempotency_key)
      WHERE idempotency_key IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_order_earn_uq
      ON wallet_ledger (order_id)
      WHERE type = 'EARN' AND order_id IS NOT NULL
  `);
}

export async function earnCoins(options: {
  customerId: string;
  orderId: string;
  amountMinor: number;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}) {
  let amountMinor = Math.round(options.amountMinor);
  if (!options.customerId || !options.orderId || amountMinor <= 0) {
    throw new Error("Invalid earn request");
  }

  return withTransaction(async (client) => {
    const order=(await client.query('SELECT status,metadata FROM "order" WHERE id=$1 FOR UPDATE',[options.orderId])).rows[0];
    if(order?.status==='canceled'||order?.status==='cancelled'||order?.metadata?.checkout_tombstone) return {applied:false,actual_balance:0};
    const originalAward=amountMinor;
    const returned=(await client.query(`SELECT
      (SELECT COALESCE(SUM((a->>'basis_minor')::numeric),0) FROM return_financial_settlement s CROSS JOIN LATERAL jsonb_array_elements(s.allocations) a WHERE s.order_id=$1) AS returned,
      COALESCE((SELECT SUM(basis_minor) FROM payment_order_item_snapshot WHERE order_id=$1),
      (SELECT SUM(round(l.unit_price::numeric*100)*oi.quantity) FROM order_item oi JOIN order_line_item l ON l.id=oi.item_id WHERE oi.order_id=$1 AND oi.deleted_at IS NULL AND l.deleted_at IS NULL)) AS basis`,[options.orderId])).rows[0];
    if(Number(returned?.basis)>0) amountMinor=originalAward-Number(BigInt(originalAward)*BigInt(returned.returned)/BigInt(returned.basis));
    const account = await ensureAccount(client, options.customerId);
    if(!amountMinor)return {applied:false,actual_balance:account.actual_balance};
    const metadata = {
      ...(options.metadata || {}),
      expires_at: options.expiresAt || null,
      original_award_minor: originalAward,
    };

    const insertedId = await insertLedgerEntry(client, {
      customer_id: options.customerId,
      order_id: options.orderId,
      type: "EARN",
      amount: amountMinor,
      reference_id: null,
      idempotency_key: `earn:${options.orderId}`,
      metadata,
    });

    if (!insertedId) {
      return {
        applied: false,
        actual_balance: account.actual_balance,
      };
    }

    const nextBalance = account.actual_balance + amountMinor;
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [nextBalance, options.customerId]
    );

    return {
      applied: true,
      actual_balance: nextBalance,
    };
  });
}

export async function spendCoins(options: {
  customerId: string;
  orderId?: string | null;
  amountMinor: number;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const amountMinor = Math.round(options.amountMinor);
  if (!options.customerId || amountMinor <= 0) {
    throw new Error("Invalid spend request");
  }

  return withTransaction(async (client) => {
    const account = await ensureAccount(client, options.customerId);
    // A retry must still succeed after the first debit exhausted the balance.
    if (options.idempotencyKey) {
      const prior = await client.query(
        `SELECT customer_id, order_id, type, amount FROM wallet_ledger WHERE idempotency_key = $1`,
        [options.idempotencyKey]
      );
      if (prior.rows[0]) {
        const entry = prior.rows[0];
        if (entry.customer_id !== options.customerId || entry.order_id !== (options.orderId || null) ||
            entry.type !== "SPEND" || Number(entry.amount) !== -amountMinor) {
          throw new Error("Wallet idempotency key reused with different spend details");
        }
        return { applied: false, actual_balance: account.actual_balance };
      }
    }
    if (account.actual_balance < 0) {
      const err = new Error("Wallet has pending adjustments");
      (err as Error & { code?: string }).code = "NEGATIVE_BALANCE";
      throw err;
    }
    if (account.actual_balance - await heldCoins(client, options.customerId) < amountMinor) {
      const err = new Error("Insufficient coins");
      (err as Error & { code?: string }).code = "INSUFFICIENT_BALANCE";
      throw err;
    }

    const insertedId = await insertLedgerEntry(client, {
      customer_id: options.customerId,
      order_id: options.orderId || null,
      type: "SPEND",
      amount: -amountMinor,
      reference_id: options.referenceId || null,
      idempotency_key: options.idempotencyKey || null,
      metadata: options.metadata,
    });

    if (!insertedId) {
      return {
        applied: false,
        actual_balance: account.actual_balance,
      };
    }

    const nextBalance = account.actual_balance - amountMinor;
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [nextBalance, options.customerId]
    );

    return {
      applied: true,
      actual_balance: nextBalance,
    };
  });
}

export async function reverseEarned(options: {
  orderId: string;
  reason?: string;
}) {
  if (!options.orderId) {
    throw new Error("orderId required");
  }

  return withTransaction(async (client) => {
    const earned = await client.query(
      `SELECT customer_id, amount
       FROM wallet_ledger
       WHERE order_id = $1 AND type = 'EARN'
       ORDER BY id ASC
       LIMIT 1`,
      [options.orderId]
    );
    if (!earned.rows[0]) {
      return { applied: false, actual_balance: null, reversedAmount: 0 };
    }

    const customerId = earned.rows[0].customer_id as string;
    let earnedAmount = Math.abs(Number(earned.rows[0].amount) || 0);
    if (earnedAmount <= 0) {
      return { applied: false, actual_balance: null, reversedAmount: 0 };
    }

    const account = await ensureAccount(client, customerId);
    const reversed=Number((await client.query("SELECT COALESCE(SUM(-amount),0) AS n FROM wallet_ledger WHERE order_id=$1 AND customer_id=$2 AND type='REVERSE'",[options.orderId,customerId])).rows[0].n);
    earnedAmount=Math.max(0,earnedAmount-reversed);
    if(!earnedAmount)return {applied:false,actual_balance:account.actual_balance,reversedAmount:0,customerId};

    const insertedId = await insertLedgerEntry(client, {
      customer_id: customerId,
      order_id: options.orderId,
      type: "REVERSE",
      amount: -earnedAmount,
      reference_id: null,
      idempotency_key: `reverse:${options.orderId}`,
      metadata: options.reason ? { reason: options.reason } : {},
    });

    if (!insertedId) {
      return { applied: false, actual_balance: account.actual_balance, reversedAmount: 0, customerId };
    }

    const nextBalance = account.actual_balance - earnedAmount;
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [nextBalance, customerId]
    );

    return { applied: true, actual_balance: nextBalance, customerId, reversedAmount: earnedAmount };
  });
}

export async function creditAdjustment(options: {
  customerId: string;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  amountMinor: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const amountMinor = Math.round(options.amountMinor);
  if (!options.customerId || amountMinor <= 0) {
    throw new Error("Invalid credit request");
  }

  return withTransaction(async (client) => {
    const account = await ensureAccount(client, options.customerId);

    const insertedId = await insertLedgerEntry(client, {
      customer_id: options.customerId,
      order_id: null,
      type: "EARN",
      amount: amountMinor,
      reference_id: options.referenceId || null,
      idempotency_key: options.idempotencyKey || null,
      metadata: {
        ...(options.metadata || {}),
        reason: options.reason || "adjustment",
      },
    });

    if (!insertedId) {
      return { applied: false, actual_balance: account.actual_balance };
    }

    const nextBalance = account.actual_balance + amountMinor;
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [nextBalance, options.customerId]
    );

    return { applied: true, actual_balance: nextBalance };
  });
}

/** Restore an order's actual debit once across cancellation, failure and return retries. */
export async function refundOrderCoinSpend(options: { orderId: string; reason: string }) {
  if (!options.orderId) throw new Error("orderId required");
  return withTransaction(async (client) => {
    const order=(await client.query('SELECT status,metadata FROM "order" WHERE id=$1 FOR UPDATE',[options.orderId])).rows[0];
    if(options.reason==='failed' && ['captured','paid','authorized'].includes(String(order?.metadata?.razorpay_payment_status))) {
      return {success:true,message:'Captured payment is not eligible for failure refund'};
    }
    const spends = await client.query(
      `SELECT customer_id, SUM(-amount) AS amount FROM wallet_ledger
       WHERE order_id = $1 AND type = 'SPEND' AND amount < 0 GROUP BY customer_id`,
      [options.orderId]
    );
    if (!spends.rows.length) return { success: true, message: "No coin spend to refund" };
    if (spends.rows.length !== 1) throw new Error("Order has coin spends from multiple customers");
    const customerId = String(spends.rows[0].customer_id);
    const account = await ensureAccount(client, customerId);
    // Include historical reason-specific credits as well as the new stable key.
    const key = `refund:order:${options.orderId}`;
    const prior = await client.query(
      `SELECT COALESCE(SUM(amount),0) AS amount FROM wallet_ledger
       WHERE customer_id = $1 AND type = 'EARN' AND amount > 0
         AND (idempotency_key = $2 OR
              (metadata->>'order_id' = $3 AND (left(idempotency_key,7) = 'refund-' OR metadata->>'source'='return_settlement')))`,
      [customerId, key, options.orderId]
    );
    const amount = Math.max(0, Number(spends.rows[0].amount) - Number(prior.rows[0].amount));
    if (!amount) return { success: true, alreadyRefunded: true, message: "Already refunded", actual_balance: account.actual_balance };
    const inserted = await insertLedgerEntry(client, {
      customer_id: customerId, order_id: null, type: "EARN", amount,
      reference_id: key, idempotency_key: key,
      metadata: { order_id: options.orderId, reason: options.reason },
    });
    if (!inserted) return { success: true, alreadyRefunded: true, actual_balance: account.actual_balance };
    const balance = account.actual_balance + amount;
    await client.query(`UPDATE wallet_account SET actual_balance=$1, updated_at=NOW() WHERE customer_id=$2`, [balance, customerId]);
    return { success: true, refunded_amount: amount / 100, applied: true, actual_balance: balance };
  });
}

export async function findSpendByReference(options: {
  customerId: string;
  referenceId: string;
}) {
  if (!options.customerId || !options.referenceId) return null;
  const pool = getPool();
  const res = await pool.query(
    `SELECT amount, metadata, created_at
     FROM wallet_ledger
     WHERE customer_id = $1 AND reference_id = $2 AND type = 'SPEND'
     ORDER BY id DESC
     LIMIT 1`,
    [options.customerId, options.referenceId]
  );
  if (!res.rows[0]) return null;
  const amount = Math.abs(Number(res.rows[0].amount) || 0);
  return {
    amountMinor: amount,
    metadata: res.rows[0].metadata as Record<string, unknown>,
    created_at: res.rows[0].created_at as string,
  };
}

export async function findSpendByReferenceAny(options: {
  referenceId: string;
}) {
  if (!options.referenceId) return null;
  const pool = getPool();
  const res = await pool.query(
    `SELECT customer_id, amount, metadata, created_at
     FROM wallet_ledger
     WHERE reference_id = $1 AND type = 'SPEND'
     ORDER BY id DESC
     LIMIT 1`,
    [options.referenceId]
  );
  if (!res.rows[0]) return null;
  const amount = Math.abs(Number(res.rows[0].amount) || 0);
  return {
    customerId: res.rows[0].customer_id as string,
    amountMinor: amount,
    metadata: res.rows[0].metadata as Record<string, unknown>,
    created_at: res.rows[0].created_at as string,
  };
}

export async function getWalletSnapshot(options: {
  customerId: string;
  limit?: number;
  offset?: number;
}) {
  const snapshot = await withTransaction(async (client) => {
    const actual=await reconcileAccountBalance(client, options.customerId);
    return {actual,reserved:await heldCoins(client,options.customerId)};
  });
  const {actual,reserved}=snapshot;
  const display = Math.max(actual - reserved, 0);
  const pendingAdjustment = actual < 0 ? Math.abs(actual) : 0;

  const limitRaw = options.limit ?? 50;
  const offsetRaw = options.offset ?? 0;
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), 100))
    : 50;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;

  const pool = getPool();
  const tx = await pool.query(
    `SELECT id, order_id, type as transaction_type, amount, reference_id, metadata, created_at
     FROM wallet_ledger
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [options.customerId, limit, offset]
  );
  const txCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM wallet_ledger WHERE customer_id = $1`,
    [options.customerId]
  );

  const sums = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'EARN' THEN amount ELSE 0 END), 0)::bigint AS earned,
       COALESCE(SUM(CASE WHEN type = 'SPEND' THEN ABS(amount) ELSE 0 END), 0)::bigint AS spent
     FROM wallet_ledger
     WHERE customer_id = $1`,
    [options.customerId]
  );
  const recentEarn = await pool.query(
    `SELECT amount FROM wallet_ledger
     WHERE customer_id = $1 AND type = 'EARN'
     ORDER BY created_at DESC LIMIT 1`,
    [options.customerId]
  );

  const transactionCount = Number(txCount.rows[0]?.count || 0);

  return {
    actual_balance_minor: actual,
    reserved_balance_minor: reserved,
    display_balance_minor: display,
    pending_adjustment_minor: pendingAdjustment,
    lifetime_earned_minor: Number(sums.rows[0]?.earned || 0),
    lifetime_spent_minor: Number(sums.rows[0]?.spent || 0),
    recent_earn_minor: Math.abs(Number(recentEarn.rows[0]?.amount || 0)),
    transactions: tx.rows as Array<Record<string, unknown>>,
    transaction_count: transactionCount,
    transaction_limit: limit,
    transaction_offset: offset,
    has_more_transactions: offset + tx.rows.length < transactionCount,
  };
}

export async function expireEarnedCoins(options: { limit?: number }) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, customer_id, amount, metadata
     FROM wallet_ledger
     WHERE type = 'EARN'
       AND (metadata->>'expires_at')::timestamp IS NOT NULL
       AND (metadata->>'expires_at')::timestamp < NOW()
     ORDER BY id ASC
     LIMIT $1`,
    [options.limit || 500]
  );
  return res.rows as Array<{ id: number; customer_id: string; amount: number; metadata: any }>;
}

export async function applyExpiry(options: {
  earnId: number;
  customerId: string;
  amountMinor: number;
}) {
  return withTransaction(async (client) => {
    const account = await ensureAccount(client, options.customerId);
    const insertedId = await insertLedgerEntry(client, {
      customer_id: options.customerId,
      order_id: null,
      type: "SPEND",
      amount: -Math.abs(options.amountMinor),
      reference_id: `expire:${options.earnId}`,
      idempotency_key: `expire:${options.earnId}`,
      metadata: { reason: "expiry", earn_id: options.earnId },
    });
    if (!insertedId) {
      return { applied: false, actual_balance: account.actual_balance };
    }
    const nextBalance = account.actual_balance - Math.abs(options.amountMinor);
    await client.query(
      `UPDATE wallet_account
       SET actual_balance = $1, updated_at = NOW()
       WHERE customer_id = $2`,
      [nextBalance, options.customerId]
    );
    return { applied: true, actual_balance: nextBalance };
  });
}
