"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  evaluateDevToolsOpen,
  handleViewportChanging,
  handleViewportSettled,
  isDevToolsShortcut,
  resetDevToolsMonitor,
} from "@/lib/debug-controller/devtools-guard";
import { useDebugControllerSettings } from "./DebugControllerProvider";

const BYPASS_PREFIXES = [
  "/debug-controller-4719",
  "/maintenance",
  "/api/",
];

const DEVTOOLS_POLL_MS = 500;
const INITIAL_CALIBRATION_DELAY_MS = 800;
const RESIZE_RECALIBRATE_MS = 500;

function shouldBypass(pathname: string) {
  return BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

function DevToolsBlockOverlay() {
  return createPortal(
    <div
      className="debug-devtools-shield fixed inset-0 z-[2147483646] flex items-center justify-center bg-slate-950 px-6 text-center"
      aria-live="assertive"
      role="alert"
    >
      <div className="max-w-md space-y-3">
        <p className="text-lg font-semibold text-white">
          Developer tools are not allowed
        </p>
        <p className="text-sm text-slate-300">
          Close Inspect / DevTools to continue using the vendor portal.
        </p>
      </div>
    </div>,
    document.body
  );
}

export default function SiteProtections() {
  const settings = useDebugControllerSettings();
  const pathname = usePathname() || "/";
  const bypass = shouldBypass(pathname);
  const blockDevTools =
    !bypass &&
    (settings.disableDevToolsShortcuts || settings.disableRightClick);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (bypass) return;

    const onContextMenu = (event: MouseEvent) => {
      if (settings.disableRightClick) {
        event.preventDefault();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!blockDevTools) return;
      if (!isDevToolsShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [bypass, blockDevTools, settings.disableRightClick]);

  useEffect(() => {
    if (!blockDevTools) {
      setDevtoolsOpen(false);
      resetDevToolsMonitor();
      return;
    }

    let initTimer: number | undefined;
    let resizeTimer: number | undefined;

    const check = () => {
      setDevtoolsOpen(evaluateDevToolsOpen());
    };

    initTimer = window.setTimeout(() => {
      handleViewportSettled();
      check();
    }, INITIAL_CALIBRATION_DELAY_MS);

    const interval = window.setInterval(check, DEVTOOLS_POLL_MS);

    const onViewportChange = () => {
      handleViewportChanging();
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        handleViewportSettled();
        setDevtoolsOpen(false);
        check();
      }, RESIZE_RECALIBRATE_MS);
    };

    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);

    return () => {
      window.clearTimeout(initTimer);
      window.clearTimeout(resizeTimer);
      window.clearInterval(interval);
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      resetDevToolsMonitor();
    };
  }, [blockDevTools]);

  useEffect(() => {
    const root = document.documentElement;
    if (devtoolsOpen && blockDevTools) {
      root.classList.add("debug-devtools-blocked");
    } else {
      root.classList.remove("debug-devtools-blocked");
    }
    return () => root.classList.remove("debug-devtools-blocked");
  }, [devtoolsOpen, blockDevTools]);

  useEffect(() => {
    const root = document.documentElement;
    if (!bypass && settings.disableTextSelect) {
      root.classList.add("debug-no-select");
    } else {
      root.classList.remove("debug-no-select");
    }
    return () => root.classList.remove("debug-no-select");
  }, [bypass, settings.disableTextSelect]);

  if (bypass) {
    return null;
  }

  return (
    <>
      {mounted && devtoolsOpen && blockDevTools ? <DevToolsBlockOverlay /> : null}
      {!settings.showAnnouncementBanner || !settings.announcementBanner ? null : (
        <div className="bg-amber-500 text-black text-center text-sm font-medium px-4 py-2">
          {settings.announcementBanner}
        </div>
      )}
    </>
  );
}
