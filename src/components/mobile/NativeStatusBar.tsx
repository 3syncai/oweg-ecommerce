"use client";

import { useEffect } from "react";
import { capacitorPlugin, isNativeApp, nativePlatform } from "@/lib/native-app";

type StatusBarInfo = {
  overlays?: boolean;
  visible?: boolean;
  style?: string;
  color?: string;
  height?: number;
};

type StatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setStyle?: (options: { style: "DARK" | "LIGHT" | "DEFAULT" }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  show?: () => Promise<void>;
  getInfo?: () => Promise<StatusBarInfo>;
};

function readCssSafeAreaTop(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);";
  document.documentElement.appendChild(probe);
  const px = Number.parseFloat(getComputedStyle(probe).paddingTop || "0") || 0;
  probe.remove();
  return px;
}

/**
 * Android major version. Prefers UA client hints (survives UA reduction),
 * falls back to the user-agent string.
 */
async function androidMajorVersion(): Promise<number> {
  try {
    const uaData = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }> };
    }).userAgentData;
    const version = (await uaData?.getHighEntropyValues?.(["platformVersion"]))?.platformVersion;
    const major = Number.parseInt(version || "", 10);
    if (Number.isFinite(major) && major > 0) return major;
  } catch {
    /* fall through to the user-agent string */
  }
  const match = /Android\s+(\d+)/i.exec(navigator.userAgent || "");
  return match ? Number(match[1]) : 0;
}

function applySafeAreaCssVar(px: number) {
  const value = `${Math.max(0, Math.round(px))}px`;
  document.documentElement.style.setProperty("--oweg-sat", value);
  document.documentElement.style.setProperty("--safe-area-top", value);
  // Header measures --app-header-height; notify after safe-area padding changes
  // so main/hero content is not tucked under the taller fixed header.
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent("oweg:safe-area", { detail: { top: px } }));
  });
}

/**
 * iOS Capacitor: keep the status bar overlaid so the white system inset
 * gap does not appear above the OWEG header. Header CSS uses safe-area padding.
 * Also publishes --oweg-sat when env(safe-area-inset-top) is 0 in the WebView.
 */
export default function NativeStatusBar() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const statusBar = capacitorPlugin<StatusBarPlugin>("StatusBar");
    if (!statusBar) return;

    void (async () => {
      try {
        await statusBar.setOverlaysWebView?.({ overlay: true });
        // White header → dark icons (Cap "LIGHT" / darkContent).
        await statusBar.setStyle?.({ style: "LIGHT" });
        if (nativePlatform() === "android") {
          await statusBar.setBackgroundColor?.({ color: "#ffffff" });
        }
        await statusBar.show?.();

        const info = await statusBar.getInfo?.();
        const cssInset = readCssSafeAreaTop();
        // Android 15+ (edge-to-edge enforced): Capacitor's native handler
        // (android.adjustMarginsForEdgeToEdge) already pushes the WebView below the
        // status bar. Adding the status-bar height again as header padding left a
        // large white gap above the logo, so only trust the CSS inset there.
        const nativeInsetHandled =
          nativePlatform() === "android" && (await androidMajorVersion()) >= 15;
        const nativeHeight =
          !nativeInsetHandled && typeof info?.height === "number" ? info.height : 0;
        // Prefer the larger of CSS env vs native status-bar height so the
        // OWEG brand row clears the Dynamic Island / notch on Capacitor.
        applySafeAreaCssVar(Math.max(cssInset, nativeHeight));
        document.documentElement.dataset.capacitor = nativePlatform();
      } catch {
        /* plugin may be unavailable during first paint */
      }
    })();

    const onResize = () => {
      const cssInset = readCssSafeAreaTop();
      const current =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--oweg-sat") || "0",
        ) || 0;
      if (cssInset > current) applySafeAreaCssVar(cssInset);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
