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
  | "enableCheckout"
  | "enableRegistration"
  | "enableWhatsAppWidget"
  | "whatsappNumber"
  | "whatsappMessage"
  | "showAnnouncementBanner"
  | "announcementBanner"
  | "maintenanceMessage"
  | "maintenanceTitle"
  | "cacheBustVersion"
>;

const DEFAULT_PUBLIC: PublicSettings = {
  siteStatus: "live",
  disableRightClick: false,
  disableTextSelect: false,
  disableDevToolsShortcuts: false,
  enableCheckout: true,
  enableRegistration: true,
  enableWhatsAppWidget: true,
  whatsappNumber: "918797787877",
  whatsappMessage: "Hi, I need help with my order.",
  showAnnouncementBanner: false,
  announcementBanner: "",
  maintenanceMessage:
    "We're performing scheduled maintenance. Please check back shortly.",
  maintenanceTitle: "We'll be back soon",
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
      const res = await fetch("/api/debug-controller/settings", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { settings?: PublicSettings };
      if (data.settings) {
        setSettings({ ...DEFAULT_PUBLIC, ...data.settings });
      }
    } catch {
      // keep defaults
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
