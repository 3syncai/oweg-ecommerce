import { capacitorPlugin, isNativeApp, nativePlatform } from "@/lib/native-app";

const API = "/api/medusa/push-subscriptions";

type PushOptions = { customerId?: string; signal?: AbortSignal };

type NativePushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    cb: (event: { value?: string; notification?: { data?: Record<string, string> } }) => void
  ) => Promise<{ remove: () => Promise<void> }>;
  getDeliveredNotifications?: () => Promise<{ notifications: unknown[] }>;
};

let registrationEpoch = 0;
let tokenWaiters: Array<(token: string | null) => void> = [];
let lastToken: string | null = null;
let listenersReady = false;

function plugin(): NativePushPlugin | null {
  if (!isNativeApp()) return null;
  return capacitorPlugin<NativePushPlugin>("PushNotifications");
}

function updated() {
  window.dispatchEvent(new Event("oweg:push-updated"));
}

async function ensureListeners(push: NativePushPlugin) {
  if (listenersReady) return;
  listenersReady = true;
  await push.addListener("registration", (event) => {
    lastToken = typeof event.value === "string" ? event.value : null;
    const waiters = tokenWaiters;
    tokenWaiters = [];
    for (const resolve of waiters) resolve(lastToken);
  });
  await push.addListener("registrationError", () => {
    const waiters = tokenWaiters;
    tokenWaiters = [];
    for (const resolve of waiters) resolve(null);
  });
  await push.addListener("pushNotificationActionPerformed", (event) => {
    const data = event.notification?.data || {};
    const raw = data.url || data.path || data.click_url || "/";
    const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/";
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.location.assign(path);
    }
  });
}

function waitForToken(timeoutMs = 12000): Promise<string | null> {
  if (lastToken) return Promise.resolve(lastToken);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      tokenWaiters = tokenWaiters.filter((item) => item !== resolve);
      resolve(null);
    }, timeoutMs);
    tokenWaiters.push((token) => {
      clearTimeout(timer);
      resolve(token);
    });
  });
}

export function nativePushSupported(): boolean {
  return Boolean(plugin());
}

/** Register FCM/APNs token with Medusa for the signed-in customer. */
export async function enableNativePush(options: PushOptions = {}): Promise<void> {
  const push = plugin();
  if (!push) throw new Error("Native notifications are only available in the OWEG app.");
  const epoch = ++registrationEpoch;
  await ensureListeners(push);

  let permission = await push.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await push.requestPermissions();
  }
  if (epoch !== registrationEpoch) throw new Error("Notification setup cancelled. Please try again.");
  if (permission.receive !== "granted") {
    throw new Error("Permission was not granted. You can change it in your device settings.");
  }

  lastToken = null;
  await push.register();
  const token = await waitForToken();
  if (epoch !== registrationEpoch) throw new Error("Notification setup cancelled. Please try again.");
  if (!token) throw new Error("Unable to register this device for notifications. Please retry.");

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
      ...(options.customerId ? { expected_customer_id: options.customerId } : {}),
    }),
    signal: options.signal || AbortSignal.timeout(8000),
  });
  const data = await saved.json().catch(() => ({}));
  if (!saved.ok) throw new Error(data.error || "Unable to save notification preference.");
  updated();
}

export async function disableNativePush(): Promise<void> {
  registrationEpoch++;
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

export async function restoreNativePush(customerId: string, signal?: AbortSignal): Promise<void> {
  if (!plugin()) return;
  try {
    await enableNativePush({ customerId, signal });
  } catch {
    /* Background restore must not interrupt browsing. */
  }
}
