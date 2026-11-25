import { capacitorPlugin, isNativeApp, nativePlatform } from "@/lib/native-app";

const API = "/api/medusa/push-subscriptions";
/** Must match android.notification.channelId in my-medusa-store/src/lib/web-push/fcm.ts */
const CHANNEL_ID = "oweg_marketing";
const ENABLED_KEY = "oweg.push.enabled";

export type NativePushPermission = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type PushOptions = { customerId?: string; signal?: AbortSignal };

type NativePushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  createChannel?: (channel: {
    id: string;
    name: string;
    description?: string;
    importance: 1 | 2 | 3 | 4 | 5;
    visibility?: -1 | 0 | 1;
    vibration?: boolean;
    lights?: boolean;
  }) => Promise<void>;
  addListener: (
    event: string,
    cb: (event: { value?: string; notification?: { data?: Record<string, string> } }) => void
  ) => Promise<{ remove: () => Promise<void> }>;
};

let registrationEpoch = 0;
let tokenWaiters: Array<(token: string | null) => void> = [];
let lastToken: string | null = null;
let activeCustomerId: string | null = null;
let initPromise: Promise<void> | null = null;

function plugin(): NativePushPlugin | null {
  if (!isNativeApp()) return null;
  return capacitorPlugin<NativePushPlugin>("PushNotifications");
}

function updated() {
  window.dispatchEvent(new Event("oweg:push-updated"));
}

function readEnabledFlag(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeEnabledFlag(value: boolean) {
  try {
    if (value) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

function normalizePermission(value: string | undefined): NativePushPermission {
  if (value === "granted" || value === "denied" || value === "prompt-with-rationale") return value;
  return "prompt";
}

async function saveToken(token: string, customerId?: string, signal?: AbortSignal): Promise<void> {
  const platform = nativePlatform();
  if (platform !== "ios" && platform !== "android") {
    throw new Error("Unsupported mobile platform for notifications.");
  }
  const saved = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "fcm",
      token,
      platform,
      ...(customerId ? { expected_customer_id: customerId } : {}),
    }),
    signal: signal || AbortSignal.timeout(15000),
  });
  const data = await saved.json().catch(() => ({}));
  if (!saved.ok) throw new Error(data.error || "Unable to save notification preference.");
}

function flushWaiters(token: string | null) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  for (const resolve of waiters) resolve(token);
}

async function attachListeners(push: NativePushPlugin) {
  await push.addListener("registration", (event) => {
    lastToken = typeof event.value === "string" ? event.value : null;
    const hadWaiters = tokenWaiters.length > 0;
    flushWaiters(lastToken);
    // The token can rotate while the app is running. Keep the server in sync
    // without waiting for the user to re-open settings.
    if (!hadWaiters && lastToken && activeCustomerId && readEnabledFlag()) {
      void saveToken(lastToken, activeCustomerId).catch(() => undefined);
    }
  });
  await push.addListener("registrationError", () => flushWaiters(null));
  await push.addListener("pushNotificationActionPerformed", (event) => {
    const data = event.notification?.data || {};
    const raw = data.url || data.path || data.click_url || "/";
    const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/";
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.location.assign(path);
    }
  });
}

/**
 * Idempotent app-start setup: listeners must exist before a notification tap
 * (including one that cold-starts the app) is delivered, and Android needs the
 * notification channel the server targets.
 */
export function initNativePush(): Promise<void> {
  const push = plugin();
  if (!push) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await attachListeners(push);
      if (nativePlatform() === "android") {
        try {
          await push.createChannel?.({
            id: CHANNEL_ID,
            name: "Offers and updates",
            description: "OWEG offers, order updates and announcements",
            importance: 4,
            visibility: 1,
            vibration: true,
          });
        } catch {
          /* channel creation is best effort */
        }
      }
    })().catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

async function requestToken(push: NativePushPlugin, timeoutMs = 20000): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (lastToken) return lastToken;
    let waiter: (token: string | null) => void = () => undefined;
    const pending = new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        tokenWaiters = tokenWaiters.filter((item) => item !== waiter);
        resolve(null);
      }, timeoutMs);
      waiter = (token) => {
        clearTimeout(timer);
        resolve(token);
      };
      tokenWaiters.push(waiter);
    });
    await push.register();
    const token = await pending;
    if (token) return token;
  }
  return null;
}

export function nativePushSupported(): boolean {
  return Boolean(plugin());
}

export async function nativePushPermission(): Promise<NativePushPermission | "unsupported"> {
  const push = plugin();
  if (!push) return "unsupported";
  try {
    return normalizePermission((await push.checkPermissions()).receive);
  } catch {
    return "unsupported";
  }
}

/** Shows the system permission dialog (only when the OS still allows asking). */
export async function requestNativePushPermission(): Promise<NativePushPermission> {
  const push = plugin();
  if (!push) return "denied";
  await initNativePush();
  return normalizePermission((await push.requestPermissions()).receive);
}

/** Tells the push layer who is signed in so rotated tokens can be re-saved. */
export function setNativePushCustomer(customerId: string | null) {
  activeCustomerId = customerId;
}

/** Register FCM/APNs token with Medusa for the signed-in customer. */
export async function enableNativePush(options: PushOptions = {}): Promise<void> {
  const push = plugin();
  if (!push) throw new Error("Native notifications are only available in the OWEG app.");
  const epoch = ++registrationEpoch;
  await initNativePush();

  let permission = normalizePermission((await push.checkPermissions()).receive);
  if (permission !== "granted") {
    permission = normalizePermission((await push.requestPermissions()).receive);
  }
  if (epoch !== registrationEpoch) throw new Error("Notification setup cancelled. Please try again.");
  if (permission !== "granted") {
    throw new Error("Permission was not granted. You can change it in your device settings.");
  }

  const token = await requestToken(push);
  if (epoch !== registrationEpoch) throw new Error("Notification setup cancelled. Please try again.");
  if (!token) throw new Error("Unable to register this device for notifications. Please retry.");

  await saveToken(token, options.customerId, options.signal);
  writeEnabledFlag(true);
  if (options.customerId) activeCustomerId = options.customerId;
  updated();
}

export async function disableNativePush(): Promise<void> {
  registrationEpoch++;
  writeEnabledFlag(false);
  if (!lastToken) return;
  const endpoint = `fcm:${lastToken}`;
  await fetch(API, {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
  lastToken = null;
  updated();
}

/**
 * Silent re-sync for a signed-in customer. Never shows a permission dialog:
 * it only runs when the OS permission was already granted.
 */
export async function restoreNativePush(customerId: string, signal?: AbortSignal): Promise<void> {
  const push = plugin();
  if (!push) return;
  try {
    await initNativePush();
    const permission = normalizePermission((await push.checkPermissions()).receive);
    if (permission !== "granted") return;
    const token = await requestToken(push);
    if (!token) return;
    await saveToken(token, customerId, signal);
    writeEnabledFlag(true);
    activeCustomerId = customerId;
    updated();
  } catch {
    /* Background restore must not interrupt browsing. */
  }
}
