"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DebugControllerSettings } from "@/lib/debug-controller/types";

type PublicSettings = Pick<
  DebugControllerSettings,
  | "siteStatus"
  | "disableRightClick"
  | "disableTextSelect"
  | "disableDevToolsShortcuts"
  | "enableRegistration"
  | "showAnnouncementBanner"
  | "announcementBanner"
  | "maintenanceMessage"
  | "maintenanceTitle"
  | "cacheBustVersion"
>;

const DEFAULT_PUBLIC: PublicSettings = {
  siteStatus: "live",
  disableRightClick: true,
  disableTextSelect: false,
  disableDevToolsShortcuts: true,
  enableRegistration: true,
  showAnnouncementBanner: false,
  announcementBanner: "",
  maintenanceMessage:
    "The vendor portal is temporarily unavailable. Please check back shortly.",
  maintenanceTitle: "Vendor portal maintenance",
  cacheBustVersion: 0,
};

const DebugControllerContext = createContext<PublicSettings>(DEFAULT_PUBLIC);

export function useDebugControllerSettings() {
  return useContext(DebugControllerContext);
}

export function DebugControllerProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_PUBLIC);
  const pending = useRef(false);

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden" || pending.current) return;
    pending.current = true;
    try {
      const res = await fetch("/api/site-settings", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { settings?: PublicSettings };
      if (data.settings) {
        setSettings({ ...DEFAULT_PUBLIC, ...data.settings });
      }
    } catch {
      // keep strict defaults
    } finally {
      pending.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const value = useMemo(() => settings, [settings]);

  return (
    <DebugControllerContext.Provider value={value}>
      {children}
    </DebugControllerContext.Provider>
  );
}
