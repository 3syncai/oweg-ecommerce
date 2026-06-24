import { vendorAuthApi } from "@/lib/api/client";

/** localStorage keys written by the vendor portal client. */
const VENDOR_LOCAL_STORAGE_KEYS = [
  "vendor_token",
  "vendor_user",
  "vendor_portal_recent_searches",
] as const;

const VENDOR_AUTH_COOKIE = "vendor_token=; path=/; max-age=0; SameSite=Lax";

/**
 * Clears vendor auth state and client-side caches (localStorage, sessionStorage,
 * auth cookie, Cache API). Does not call the logout API.
 */
export async function clearVendorClientCache(): Promise<void> {
  if (typeof window === "undefined") return;

  for (const key of VENDOR_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore quota / private mode errors
    }
  }

  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }

  document.cookie = VENDOR_AUTH_COOKIE;

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch {
      // ignore — Cache API may be unavailable
    }
  }
}

/**
 * Signs out on the server (best effort), wipes all client cache, then hard-
 * redirects so in-memory React state is dropped.
 */
export async function performVendorLogout(
  redirectTo = "/login"
): Promise<void> {
  try {
    await vendorAuthApi.logout();
  } catch {
    // still clear client state if the network call fails
  }

  await clearVendorClientCache();
  window.location.href = redirectTo;
}
