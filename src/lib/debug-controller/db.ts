import { Pool } from "pg";

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

export function isDebugControllerEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG_CONTROLLER === "true";
}

export function getDebugControllerDatabaseUrl(): string | undefined {
  // Prefer dedicated debug URL; otherwise scoped storefront URL — never silent.
  return (
    process.env.DEBUG_CONTROLLER_DATABASE_URL?.trim() ||
    process.env.STOREFRONT_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim()
  );
}

export function getDebugControllerPool(): Pool {
  if (!isDebugControllerEnabled()) {
    throw new Error("Debug controller DB is disabled (set ENABLE_DEBUG_CONTROLLER=true)");
  }
  const url = getDebugControllerDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  }
  return pool;
}

export async function ensureDebugControllerTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = getDebugControllerPool();
      const query = { text: `
        CREATE TABLE IF NOT EXISTS debug_controller_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `, query_timeout: 3000 };
      await db.query(query);
    })().catch(error => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}
