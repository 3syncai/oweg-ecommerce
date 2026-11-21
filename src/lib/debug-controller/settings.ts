import {
  DEFAULT_DEBUG_SETTINGS,
  type DebugControllerSettings,
} from "./types";
import {
  ensureDebugControllerTable,
  getDebugControllerDatabaseUrl,
  getDebugControllerPool,
  isDebugControllerEnabled,
} from "./db";

const SETTINGS_KEY = "global";

let cachedSettings: DebugControllerSettings | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;
const FAILURE_BACKOFF_MS = 3000;
let retryAt = 0;
let pendingRead: Promise<DebugControllerSettings> | null = null;

function mergeSettings(
  partial: Partial<DebugControllerSettings> | null | undefined
): DebugControllerSettings {
  return {
    ...DEFAULT_DEBUG_SETTINGS,
    ...(partial || {}),
  };
}

async function readSettingsFromDb(): Promise<DebugControllerSettings> {
  // Public reads must work in production even when the debug admin flag is off.
  const poolOpts = { allowWithoutDebugFlag: true };
  await ensureDebugControllerTable(poolOpts);
  const db = getDebugControllerPool(poolOpts);
  const query = {
    text: "SELECT value FROM debug_controller_settings WHERE key = $1 LIMIT 1",
    values: [SETTINGS_KEY],
    query_timeout: 3000,
  };
  const read = async () => {
    const result = await db.query<{ value: Partial<DebugControllerSettings> }>(query);
    return mergeSettings(result.rows[0]?.value);
  };
  try {
    return await read();
  } catch (error) {
    // Existing deployments only need SELECT. Bootstrap on a new database.
    if ((error as { code?: unknown } | null)?.code !== "42P01") throw error;
    await ensureDebugControllerTable(poolOpts);
    return read();
  }
}

export async function getDebugControllerSettings(
  options?: { bypassCache?: boolean }
): Promise<DebugControllerSettings> {
  // CI / local builds without DATABASE_URL — use defaults, do not hit Postgres
  if (!getDebugControllerDatabaseUrl()) {
    return mergeSettings(null);
  }

  if (options?.bypassCache) {
    try {
      return await readSettingsFromDb();
    } catch (error) {
      console.error("[debug-controller/settings] bypass read failed, using defaults:", error);
      return mergeSettings(null);
    }
  }

  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) return cachedSettings;
  if (pendingRead) return pendingRead;
  if (now < retryAt && cachedSettings) return cachedSettings;

  const read = readSettingsFromDb()
    .then((settings) => {
      if (pendingRead === read) {
        cachedSettings = settings;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        retryAt = 0;
      }
      return settings;
    })
    .catch((error: unknown) => {
      if (pendingRead === read) retryAt = Date.now() + FAILURE_BACKOFF_MS;
      const code = (error as { code?: unknown } | null)?.code;
      console.error("[site-settings] Database read failed", {
        code: typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? code : "unknown",
      });
      // Storefront must stay up — serve last good cache or defaults.
      if (cachedSettings) return cachedSettings;
      const defaults = mergeSettings(null);
      cachedSettings = defaults;
      cacheExpiresAt = Date.now() + Math.min(CACHE_TTL_MS, 15_000);
      return defaults;
    })
    .finally(() => {
      if (pendingRead === read) pendingRead = null;
    });
  pendingRead = read;
  return read;
}

export async function updateDebugControllerSettings(
  patch: Partial<DebugControllerSettings>
): Promise<DebugControllerSettings> {
  if (!isDebugControllerEnabled()) {
    throw new Error("Debug controller is disabled (set ENABLE_DEBUG_CONTROLLER=true)");
  }
  const current = await getDebugControllerSettings({ bypassCache: true });
  const next = mergeSettings({ ...current, ...patch });

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

  invalidateDebugSettingsCache();
  cachedSettings = next;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return next;
}

export function invalidateDebugSettingsCache() {
  cachedSettings = null;
  cacheExpiresAt = 0;
  pendingRead = null;
  retryAt = 0;
}

/** Curated subset safe to expose on the public storefront without admin auth. */
export function toPublicSiteSettings(settings: DebugControllerSettings) {
  return {
    siteStatus: settings.siteStatus,
    disableRightClick: settings.disableRightClick,
    disableTextSelect: settings.disableTextSelect,
    disableDevToolsShortcuts: settings.disableDevToolsShortcuts,
    enableCheckout: settings.enableCheckout,
    enableRegistration: settings.enableRegistration,
    enableWhatsAppWidget: settings.enableWhatsAppWidget,
    whatsappNumber: settings.whatsappNumber,
    whatsappMessage: settings.whatsappMessage,
    showAnnouncementBanner: settings.showAnnouncementBanner,
    announcementBanner: settings.announcementBanner,
    maintenanceMessage: settings.maintenanceMessage,
    maintenanceTitle: settings.maintenanceTitle,
    cacheBustVersion: settings.cacheBustVersion,
  };
}
