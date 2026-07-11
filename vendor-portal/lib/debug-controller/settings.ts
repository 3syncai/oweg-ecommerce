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

  try {
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
  } catch (error) {
    console.error("[debug-controller] failed to load settings:", error);
    const settings = mergeSettings(null);
    cachedSettings = settings;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return settings;
  }
}

export async function updateDebugControllerSettings(
  patch: Partial<DebugControllerSettings>
): Promise<DebugControllerSettings> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "DATABASE_URL is not configured on this deployment. Add it in Vercel → vendor-portal → Settings → Environment Variables."
    );
  }

  const current = await getDebugControllerSettings({ bypassCache: true });
  const next = mergeSettings({ ...current, ...patch });

  try {
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
  } catch (error) {
    console.error("[debug-controller] failed to save settings:", error);
    const message =
      error instanceof Error ? error.message : "Database error while saving settings";
    throw new Error(message);
  }

  cachedSettings = next;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return next;
}

/** Curated subset safe to expose on the vendor portal without admin auth. */
export function toPublicSiteSettings(settings: DebugControllerSettings) {
  return {
    siteStatus: settings.siteStatus,
    disableRightClick: settings.disableRightClick,
    disableTextSelect: settings.disableTextSelect,
    disableDevToolsShortcuts: settings.disableDevToolsShortcuts,
    enableRegistration: settings.enableRegistration,
    showAnnouncementBanner: settings.showAnnouncementBanner,
    announcementBanner: settings.announcementBanner,
    maintenanceMessage: settings.maintenanceMessage,
    maintenanceTitle: settings.maintenanceTitle,
    cacheBustVersion: settings.cacheBustVersion,
  };
}
