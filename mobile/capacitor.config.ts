import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Flavors:
 * - preview (default): OWEG Preview → https://0weg.in  (private TestFlight / Play internal)
 * - production: OWEG → https://oweg.in  (update existing store listings; set live bundle IDs)
 *
 * Override live IDs when cutting over:
 *   OWEG_IOS_BUNDLE_ID / OWEG_ANDROID_APP_ID
 */
const flavor = process.env.OWEG_APP_FLAVOR === "production" ? "production" : "preview";
const isPreview = flavor === "preview";

const previewAppId = "in.oweg.store.preview";
const productionAppId =
  process.env.OWEG_ANDROID_APP_ID ||
  process.env.OWEG_IOS_BUNDLE_ID ||
  "in.oweg.store";

const config: CapacitorConfig = {
  appId: isPreview ? previewAppId : productionAppId,
  appName: isPreview ? "OWEG Preview" : "OWEG",
  webDir: "www",
  server: {
    // Remote storefront — UI is the website by design (Capacitor wrap).
    // Keep shop + Razorpay inside the WebView; do not open Safari for these hosts.
    url: isPreview ? "https://0weg.in" : "https://oweg.in",
    cleartext: false,
    allowNavigation: [
      "0weg.in",
      "www.0weg.in",
      "oweg.in",
      "www.oweg.in",
      "razorpay.com",
      "*.razorpay.com",
      "api.razorpay.com",
      "checkout.razorpay.com",
      "lumberjack.razorpay.com",
    ],
  },
  plugins: {
    SplashScreen: {
      // Stay up until storefront NativeBootSplash hides it (avoids white flash / Safari feel).
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#fafbf7",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#fafbf7",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    // Keep the storefront below the Android status bar and inside the system bars.
    adjustMarginsForEdgeToEdge: "auto",
    allowMixedContent: false,
    backgroundColor: "#fafbf7",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#fafbf7",
    // Must be a valid URL scheme token (no spaces). Display name is appName, not scheme.
    scheme: isPreview ? "owegpreview" : "oweg",
    preferredContentMode: "mobile",
  },
};

export default config;
