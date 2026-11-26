import { capacitorPlugin, isNativeApp, nativePlatform } from "./native-app";

type StatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  setStyle?: (options: { style: string }) => Promise<void>;
  show?: () => Promise<void>;
};

/**
 * Capacitor StatusBar chrome for Preview/Prod shells.
 * Overlay the WebView and let header CSS + NativeStatusBar apply safe-area
 * (avoids the white system gap above the OWEG header on iPhone).
 */
export async function applyNativeStatusBar(): Promise<void> {
  if (!isNativeApp()) return;

  const statusBar = capacitorPlugin<StatusBarPlugin>("StatusBar");
  if (!statusBar) return;

  try {
    await statusBar.setOverlaysWebView?.({ overlay: true });
    await statusBar.setStyle?.({ style: "LIGHT" });
    if (nativePlatform() === "android") {
      await statusBar.setBackgroundColor?.({ color: "#ffffff" });
    }
    await statusBar.show?.();
  } catch {
    /* plugin may be unavailable during early WebView boot */
  }
}
