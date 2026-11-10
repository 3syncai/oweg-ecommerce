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

async function readSettings(): Promise<DebugControllerSettings> {
  const db = getDebugControllerPool();
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
    await ensureDebugControllerTable();
    return read();
  }
}

export async function getDebugControllerSettings(
  options?: { bypassCache?: boolean }
): Promise<DebugControllerSettings> {
  if (!isDebugControllerEnabled()) return mergeSettings(null);
  if (!getDebugControllerDatabaseUrl() && process.env.NODE_ENV !== "production") {
    return mergeSettings(null);
  }
  if (options?.bypassCache) return readSettings();

  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) return cachedSettings;
  if (pendingRead) return pendingRead;
  if (now < retryAt) throw new Error("Site settings temporarily unavailable");

  const read = readSettings().then(settings => {
    if (pendingRead === read) {
      cachedSettings = settings;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }
    return settings;
  }).catch((error: unknown) => {
    if (pendingRead === read) retryAt = Date.now() + FAILURE_BACKOFF_MS;
    const code = (error as { code?: unknown } | null)?.code;
    console.error("[site-settings] Database read failed", {
      code: typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? code : "unknown",
    });
    throw error;
  }).finally(() => {
    if (pendingRead === read) pendingRead = null;
  });
  pendingRead = read;
  return read;
}

export async function updateDebugControllerSettings(
  patch: Partial<DebugControllerSettings>
): Promise<DebugControllerSettings> {
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
