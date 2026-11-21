"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native-app";
import { applyNativeStatusBar } from "@/lib/native-status-bar";

/**
 * Applies Capacitor StatusBar insets once the remote storefront bridge is ready.
 * Config also sets overlaysWebView: false at sync time; this re-asserts after load/resume.
 */
export default function NativeStatusBar() {
  useEffect(() => {
    if (!isNativeApp()) return;

    void applyNativeStatusBar();

    const onResume = () => {
      void applyNativeStatusBar();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);

    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);

  return null;
}
