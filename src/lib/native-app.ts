/** Capacitor injects `window.Capacitor` into the remote WebView. */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function bridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

export function isNativeApp(): boolean {
  try {
    return Boolean(bridge()?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  const platform = bridge()?.getPlatform?.()?.toLowerCase();
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

export function capacitorPlugin<T = unknown>(name: string): T | null {
  const plugin = bridge()?.Plugins?.[name];
  return (plugin as T) || null;
}
