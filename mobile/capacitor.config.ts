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

const overrideUrl = process.env.OWEG_CAP_SERVER_URL?.trim();
const defaultUrl = isPreview ? "https://www.0weg.in" : "https://oweg.in";
const serverUrl = overrideUrl || defaultUrl;

const config: CapacitorConfig = {
  appId: isPreview ? previewAppId : productionAppId,
  appName: isPreview ? "OWEG Preview" : "OWEG",
  webDir: "www",
  server: {
    // Remote storefront — UI is the website by design (Capacitor wrap).
    // Keep shop + Razorpay inside the WebView; do not open Safari for these hosts.
    // Use the final origin: redirecting to www loses Android's origin-scoped bridge injection.
    // OWEG_CAP_SERVER_URL overrides for USB LAN testing (e.g. http://192.168.0.105:3000).
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
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
      "192.168.0.105",
      "localhost",
      "127.0.0.1",
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
      // Draw the WebView under the status bar; CSS safe-area pads the header.
      // contentInset "automatic" + CSS padding caused the white gap on iPhone.
      // LIGHT = dark status icons (time/battery) on the white OWEG header.
      style: "LIGHT",
      backgroundColor: "#ffffff",
      overlaysWebView: true,
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
    // Edge-to-edge WebView — never add a system content inset above the page.
    contentInset: "never",
    backgroundColor: "#ffffff",
    // Must be a valid URL scheme token (no spaces). Display name is appName, not scheme.
    scheme: isPreview ? "owegpreview" : "oweg",
    preferredContentMode: "mobile",
  },
};

export default config;
