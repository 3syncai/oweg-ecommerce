import { Pool, PoolClient } from "pg";

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
  const amountMinor = Math.round(options.amountMinor);
  if (!options.customerId || !options.orderId || amountMinor <= 0) {
    throw new Error("Invalid earn request");
  }

  return withTransaction(async (client) => {
    const account = await ensureAccount(client, options.customerId);
    const metadata = {
      ...(options.metadata || {}),
      expires_at: options.expiresAt || null,
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
    if (account.actual_balance < 0) {
      const err = new Error("Wallet has pending adjustments");
      (err as Error & { code?: string }).code = "NEGATIVE_BALANCE";
      throw err;
    }
    if (account.actual_balance < amountMinor) {
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
    const earnedAmount = Math.abs(Number(earned.rows[0].amount) || 0);
    if (earnedAmount <= 0) {
      return { applied: false, actual_balance: null, reversedAmount: 0 };
    }

    const account = await ensureAccount(client, customerId);

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

export async function getWalletSnapshot(options: { customerId: string }) {
  const actual = await withTransaction(async (client) => {
    return reconcileAccountBalance(client, options.customerId);
  });
  const display = Math.max(actual, 0);
  const pendingAdjustment = actual < 0 ? Math.abs(actual) : 0;

  const pool = getPool();
  const tx = await pool.query(
    `SELECT id, order_id, type as transaction_type, amount, reference_id, metadata, created_at
     FROM wallet_ledger
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
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

  return {
    actual_balance_minor: actual,
    display_balance_minor: display,
    pending_adjustment_minor: pendingAdjustment,
    lifetime_earned_minor: Number(sums.rows[0]?.earned || 0),
    lifetime_spent_minor: Number(sums.rows[0]?.spent || 0),
    recent_earn_minor: Math.abs(Number(recentEarn.rows[0]?.amount || 0)),
    transactions: tx.rows as Array<Record<string, unknown>>,
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
