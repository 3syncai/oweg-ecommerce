import {
  disableBrowserPush,
  enableBrowserPush,
  restoreBrowserPush,
  resumeBrowserPushSession,
} from "@/lib/browser-push";
import { isNativeApp } from "@/lib/native-app";
import {
  disableNativePush,
  enableNativePush,
  nativePushSupported,
  restoreNativePush,
} from "@/lib/native-push";

type PushOptions = { customerId?: string; signal?: AbortSignal };

export function devicePushSupported(): boolean {
  if (isNativeApp()) return nativePushSupported();
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function resumeDevicePushSession() {
  if (!isNativeApp()) resumeBrowserPushSession();
}

export async function enableDevicePush(options: PushOptions = {}) {
  if (isNativeApp()) return enableNativePush(options);
  return enableBrowserPush(options);
}

export async function disableDevicePush() {
  if (isNativeApp()) return disableNativePush();
  return disableBrowserPush();
}

export async function restoreDevicePush(customerId: string, signal?: AbortSignal) {
  if (isNativeApp()) return restoreNativePush(customerId, signal);
  return restoreBrowserPush(customerId, signal);
}
