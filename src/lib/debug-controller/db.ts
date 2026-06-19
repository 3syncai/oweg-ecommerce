import { Pool } from "pg";

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

export function getDebugControllerPool(): Pool {
  const url = process.env.DATABASE_URL;
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
