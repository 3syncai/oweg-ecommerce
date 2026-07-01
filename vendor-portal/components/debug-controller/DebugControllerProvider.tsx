"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const load = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const value = useMemo(() => settings, [settings]);

  return (
    <DebugControllerContext.Provider value={value}>
      {children}
    </DebugControllerContext.Provider>
  );
}
