export type SiteStatus = "live" | "maintenance" | "read_only";

export type DebugControllerSettings = {
  siteStatus: SiteStatus;
  disableRightClick: boolean;
  disableTextSelect: boolean;
  disableDevToolsShortcuts: boolean;
  enableRegistration: boolean;
  showAnnouncementBanner: boolean;
  announcementBanner: string;
  maintenanceMessage: string;
  maintenanceTitle: string;
  cacheBustVersion: number;
};

/** Vendor portal defaults — strict DevTools protection on by default. */
export const DEFAULT_DEBUG_SETTINGS: DebugControllerSettings = {
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

export type DebugControllerStats = {
  products: number;
  variants: number;
  orders: number;
  customers: number;
  vendors: number;
};
