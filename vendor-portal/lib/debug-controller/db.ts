import { Pool } from "pg";

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

function isLocalConnection(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function buildPool(url: string): Pool {
  const sslDisabled = process.env.PGSSLMODE === "disable";
  const needsSSL = !sslDisabled && !isLocalConnection(url);

  const nextPool = new Pool({
    connectionString: url,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  nextPool.on("error", (err) => {
    console.error("[debug-controller-db] idle client error:", err.message);
  });

  return nextPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDebugControllerPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = buildPool(url);
  }
  return pool;
}

export async function ensureDebugControllerTable(): Promise<void> {
  if (!isDatabaseConfigured()) return;

  if (!tableReady) {
    tableReady = (async () => {
      const db = getDebugControllerPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS debug_controller_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}
