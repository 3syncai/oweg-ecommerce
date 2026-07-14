const HEALTH_CARE_HANDLE = "health-care";
const LEGACY_STORAGE_KEY = "oweg_health_care_age_ok";

/** In-memory only — resets on full page refresh; survives soft SPA navigations. */
let sessionVerified = false;
let legacyStorageCleared = false;

export function isHealthCareCategoryHandle(handle?: string | null): boolean {
  if (!handle?.trim()) return false;
  const normalized = handle.trim().toLowerCase();
  return (
    normalized === HEALTH_CARE_HANDLE ||
    normalized.endsWith(`-${HEALTH_CARE_HANDLE}`) ||
    normalized.includes(HEALTH_CARE_HANDLE)
  );
}

/** True for `/c/health-care` and nested subcategory paths. */
export function isHealthCarePath(pathname?: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0].toLowerCase();
  return (
    path === `/c/${HEALTH_CARE_HANDLE}` ||
    path.startsWith(`/c/${HEALTH_CARE_HANDLE}/`)
  );
}

export function productHasHealthCareCategory(
  categories?: Array<{ handle?: string | null; title?: string | null }> | null
): boolean {
  if (!categories?.length) return false;
  return categories.some((cat) => {
    if (isHealthCareCategoryHandle(cat.handle)) return true;
    const title = cat.title?.trim().toLowerCase() ?? "";
    return title === "health care" || title.includes("health care");
  });
}

/** Remove leftover localStorage key from older builds (once per page load). */
export function clearLegacyHealthCareAgeStorage(): void {
  if (typeof window === "undefined" || legacyStorageCleared) return;
  legacyStorageCleared = true;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readHealthCareAgeVerified(): boolean {
  return sessionVerified;
}

export function writeHealthCareAgeVerified(): void {
  sessionVerified = true;
}
