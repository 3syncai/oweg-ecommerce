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

export type DebugPoolOptions = {
  /**
   * Public storefront settings reads may hit Postgres without the debug flag.
   * Admin/debug mutations and tools still require ENABLE_DEBUG_CONTROLLER=true
   * in production.
   */
  allowWithoutDebugFlag?: boolean;
};

function isLocalConnection(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function buildPool(url: string): Pool {
  const sslDisabled =
    process.env.PGSSLMODE === "disable" ||
    /(?:^|[?&])sslmode=disable(?:&|$)/i.test(url);
  const needsSSL = !sslDisabled && !isLocalConnection(url);

  const nextPool = new Pool({
    connectionString: url,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Real pg.Pool exposes .on; security-regression stubs may not.
  if (typeof nextPool.on === "function") {
    nextPool.on("error", (err: Error) => {
      console.error("[debug-controller-db] idle client error:", err.message);
    });
  }

  return nextPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDebugControllerDatabaseUrl());
}

export function getDebugControllerPool(options?: DebugPoolOptions): Pool {
  if (!options?.allowWithoutDebugFlag && !isDebugControllerEnabled()) {
    throw new Error("Debug controller DB is disabled (set ENABLE_DEBUG_CONTROLLER=true)");
  }
  const url = getDebugControllerDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = buildPool(url);
  }
  return pool;
}

export async function ensureDebugControllerTable(
  options?: DebugPoolOptions
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  if (!tableReady) {
    tableReady = (async () => {
      const db = getDebugControllerPool(options);
      // query_timeout is supported by node-postgres at runtime; @types/pg omits it.
      await db.query({
        text: `
        CREATE TABLE IF NOT EXISTS debug_controller_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
        query_timeout: 3000,
      } as { text: string });
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}
