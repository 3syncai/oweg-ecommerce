import {
  DEFAULT_DEBUG_SETTINGS,
  type DebugControllerSettings,
} from "./types";
import { ensureDebugControllerTable, getDebugControllerPool, isDatabaseConfigured } from "./db";

const SETTINGS_KEY = "vendor_portal";

let cachedSettings: DebugControllerSettings | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5_000;

function mergeSettings(
  partial: Partial<DebugControllerSettings> | null | undefined
): DebugControllerSettings {
  return {
    ...DEFAULT_DEBUG_SETTINGS,
    ...(partial || {}),
  };
}

export async function getDebugControllerSettings(
  options?: { bypassCache?: boolean }
): Promise<DebugControllerSettings> {
  const now = Date.now();
  if (
    !options?.bypassCache &&
    cachedSettings &&
    now < cacheExpiresAt
  ) {
    return cachedSettings;
  }

  if (!isDatabaseConfigured()) {
    const settings = mergeSettings(null);
    cachedSettings = settings;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return settings;
  }

  await ensureDebugControllerTable();
  const db = getDebugControllerPool();
  const result = await db.query<{ value: Partial<DebugControllerSettings> }>(
    `SELECT value FROM debug_controller_settings WHERE key = $1 LIMIT 1`,
    [SETTINGS_KEY]
  );

  const settings = mergeSettings(result.rows[0]?.value);
  cachedSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return settings;
}

export async function updateDebugControllerSettings(
  patch: Partial<DebugControllerSettings>
): Promise<DebugControllerSettings> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured — cannot persist debug settings");
  }

  const current = await getDebugControllerSettings({ bypassCache: true });
  const next = mergeSettings({ ...current, ...patch });

  await ensureDebugControllerTable();
  const db = getDebugControllerPool();
  await db.query(
    `
      INSERT INTO debug_controller_settings (key, value, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    [SETTINGS_KEY, JSON.stringify(next)]
  );

  cachedSettings = next;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return next;
}
