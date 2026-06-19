export type SiteStatus = "live" | "maintenance" | "read_only";

export type DebugControllerSettings = {
  siteStatus: SiteStatus;
  disableRightClick: boolean;
  disableTextSelect: boolean;
  disableDevToolsShortcuts: boolean;
  enableCheckout: boolean;
  enableRegistration: boolean;
  enableWhatsAppWidget: boolean;
  whatsappNumber: string;
  whatsappMessage: string;
  showAnnouncementBanner: boolean;
  announcementBanner: string;
  maintenanceMessage: string;
  maintenanceTitle: string;
  cacheBustVersion: number;
};

export const DEFAULT_DEBUG_SETTINGS: DebugControllerSettings = {
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

export type DebugControllerStats = {
  products: number;
  variants: number;
  orders: number;
  customers: number;
  carts: number;
  abandonedCarts: number;
  returnRequests: number;
  vendors: number;
};

export type DebugAction =
  | "cleanup-test-payments"
  | "purge-abandoned-carts"
  | "revalidate-all"
  | "remove-opensearch-product"
  | "sync-opensearch-index"
  | "clear-flash-sale-cache";

export type ProductSearchResult = {
  id: string;
  title: string;
  handle: string;
  status: string;
  thumbnail?: string | null;
};
