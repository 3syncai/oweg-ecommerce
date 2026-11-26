#!/usr/bin/env node
/**
 * Writes capacitor.config.json from the active flavor so `cap sync`
 * always sees Preview (0weg.in) or Production (oweg.in) settings.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flavor = process.env.OWEG_APP_FLAVOR === "production" ? "production" : "preview";
const isPreview = flavor === "preview";
const previewAppId = "in.oweg.store.preview";
const productionAppId =
  process.env.OWEG_ANDROID_APP_ID ||
  process.env.OWEG_IOS_BUNDLE_ID ||
  "in.oweg.store";

/** Optional LAN URL for USB device testing, e.g. OWEG_CAP_SERVER_URL=http://192.168.0.105:3000 */
const overrideUrl = process.env.OWEG_CAP_SERVER_URL?.trim();
const defaultUrl = isPreview ? "https://www.0weg.in" : "https://oweg.in";
const serverUrl = overrideUrl || defaultUrl;
const cleartext = serverUrl.startsWith("http://");

const config = {
  appId: isPreview ? previewAppId : productionAppId,
  appName: "Oweg Online Shopping App",
  webDir: "www",
  server: {
    // Match the final storefront origin so Capacitor injects the native bridge.
    url: serverUrl,
    cleartext,
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
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    adjustMarginsForEdgeToEdge: "auto",
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#ffffff",
    scheme: isPreview ? "owegpreview" : "oweg",
    preferredContentMode: "mobile",
  },
};

writeFileSync(join(root, "capacitor.config.json"), JSON.stringify(config, null, 2) + "\n");
console.log(`[oweg-mobile] flavor=${flavor} appId=${config.appId} url=${config.server.url}`);
