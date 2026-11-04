import { Pool } from "pg";

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

function assertDebugDbAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_CONTROLLER !== "true") {
    throw new Error("Debug controller DB is disabled (set ENABLE_DEBUG_CONTROLLER=true)");
  }
}

export function getDebugControllerPool(): Pool {
  assertDebugDbAllowed();
  // Prefer dedicated debug URL; otherwise scoped storefront URL — never silent.
  const url =
    process.env.DEBUG_CONTROLLER_DATABASE_URL?.trim() ||
    process.env.STOREFRONT_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export async function ensureDebugControllerTable(): Promise<void> {
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
    })();
  }
  await tableReady;
}
