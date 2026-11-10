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

const config = {
  appId: isPreview ? previewAppId : productionAppId,
  appName: "Oweg Online Shopping App",
  webDir: "www",
  server: {
    // Match the final storefront origin so Capacitor injects the native bridge.
    url: isPreview ? "https://www.0weg.in" : "https://oweg.in",
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
    adjustMarginsForEdgeToEdge: "auto",
    allowMixedContent: false,
    backgroundColor: "#fafbf7",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#fafbf7",
    scheme: isPreview ? "owegpreview" : "oweg",
    preferredContentMode: "mobile",
  },
};

writeFileSync(join(root, "capacitor.config.json"), JSON.stringify(config, null, 2) + "\n");
console.log(`[oweg-mobile] flavor=${flavor} appId=${config.appId} url=${config.server.url}`);
