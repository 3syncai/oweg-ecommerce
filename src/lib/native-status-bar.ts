import { capacitorPlugin, isNativeApp } from "./native-app";

/** Mirrors @capacitor/status-bar Style.Light — dark icons on light chrome. */
const STATUS_BAR_STYLE_LIGHT = "LIGHT";
const STATUS_BAR_BG = "#ffffff";

type StatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  setStyle?: (options: { style: string }) => Promise<void>;
  show?: () => Promise<void>;
};

/**
 * Capacitor StatusBar chrome for Preview/Prod shells.
 * Keeps the storefront below the system status bar / Dynamic Island / notch
 * using the OS inset (no hardcoded top padding).
 */
export async function applyNativeStatusBar(): Promise<void> {
  if (!isNativeApp()) return;

  const statusBar = capacitorPlugin<StatusBarPlugin>("StatusBar");
  if (!statusBar) return;

  try {
    await statusBar.setOverlaysWebView?.({ overlay: false });
    await statusBar.setBackgroundColor?.({ color: STATUS_BAR_BG });
    await statusBar.setStyle?.({ style: STATUS_BAR_STYLE_LIGHT });
    await statusBar.show?.();
  } catch {
    /* plugin may be unavailable during early WebView boot */
  }
}
