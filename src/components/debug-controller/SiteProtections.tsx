"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDebugControllerSettings } from "./DebugControllerProvider";

const BYPASS_PREFIXES = [
  "/debug-controller-4719",
  "/maintenance",
  "/api/",
];

function shouldBypass(pathname: string) {
  return BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

export default function SiteProtections() {
  const settings = useDebugControllerSettings();
  const pathname = usePathname() || "/";
  const bypass = shouldBypass(pathname);

  useEffect(() => {
    if (bypass) return;

    const onContextMenu = (event: MouseEvent) => {
      if (settings.disableRightClick) {
        event.preventDefault();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!settings.disableDevToolsShortcuts) return;
      const key = event.key.toLowerCase();
      const blocked =
        key === "f12" ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (event.metaKey && event.altKey && ["i", "j", "c"].includes(key));
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    bypass,
    settings.disableRightClick,
    settings.disableDevToolsShortcuts,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    if (!bypass && settings.disableTextSelect) {
      root.classList.add("debug-no-select");
    } else {
      root.classList.remove("debug-no-select");
    }
    return () => root.classList.remove("debug-no-select");
  }, [bypass, settings.disableTextSelect]);

  if (bypass || !settings.showAnnouncementBanner || !settings.announcementBanner) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-black text-center text-sm font-medium px-4 py-2">
      {settings.announcementBanner}
    </div>
  );
}
