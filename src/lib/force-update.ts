import { isNativeApp, nativePlatform } from "./native-app";

export type AppVersionPolicy = {
  ios: { min_version: string; store_url: string };
  android: { min_version: string; store_url: string };
  message?: string;
};

type AppPlugin = {
  getInfo: () => Promise<{ version?: string; build?: string }>;
  openUrl?: (options: { url: string }) => Promise<void>;
};

function parseVersion(value: string): number[] {
  return value
    .split(/[.+-]/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part.replace(/\D/g, ""), 10) || 0);
}

/** Returns true when current < minimum (semver-ish dotted numbers). */
export function isVersionBelow(current: string, minimum: string): boolean {
  if (!current || !minimum) return false;
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left < right) return true;
    if (left > right) return false;
  }
  return false;
}

export async function fetchAppVersionPolicy(signal?: AbortSignal): Promise<AppVersionPolicy | null> {
  try {
    const response = await fetch("/api/medusa/app-version", {
      cache: "no-store",
      credentials: "omit",
      signal: signal || AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as AppVersionPolicy;
  } catch {
    return null;
  }
}

export async function readNativeAppVersion(): Promise<string | null> {
  if (!isNativeApp()) return null;
  const app = (window as Window & { Capacitor?: { Plugins?: { App?: AppPlugin } } }).Capacitor
    ?.Plugins?.App;
  if (!app?.getInfo) return null;
  try {
    const info = await app.getInfo();
    return info.version || null;
  } catch {
    return null;
  }
}

export async function openStoreListing(url: string): Promise<void> {
  if (!url) return;
  const app = (window as Window & { Capacitor?: { Plugins?: { App?: AppPlugin } } }).Capacitor
    ?.Plugins?.App;
  if (app?.openUrl) {
    await app.openUrl({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function evaluateForceUpdate(signal?: AbortSignal): Promise<{
  required: boolean;
  message: string;
  storeUrl: string;
  currentVersion: string | null;
} | null> {
  if (!isNativeApp()) return null;
  const platform = nativePlatform();
  if (platform !== "ios" && platform !== "android") return null;
  const [policy, currentVersion] = await Promise.all([
    fetchAppVersionPolicy(signal),
    readNativeAppVersion(),
  ]);
  if (!policy || !currentVersion) return null;
  const target = policy[platform];
  if (!target?.min_version) return null;
  if (!isVersionBelow(currentVersion, target.min_version)) {
    return { required: false, message: "", storeUrl: target.store_url || "", currentVersion };
  }
  return {
    required: true,
    message:
      policy.message ||
      "A required update is available. Please update OWEG to continue shopping.",
    storeUrl: target.store_url || "",
    currentVersion,
  };
}
