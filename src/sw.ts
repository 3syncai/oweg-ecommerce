import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Register before defaultCache so its API and catch-all rules cannot cache API data.
const apiNetworkOnly: RuntimeCaching = {
  matcher: ({ url }) => url.pathname === "/api" || url.pathname.startsWith("/api/"),
  handler: new NetworkOnly(),
};

// Remove responses saved by previous workers, including defaultCache API caches.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name === "oweg-api") {
        await caches.delete(name);
        continue;
      }
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const { pathname } = new URL(request.url);
        if (pathname === "/api" || pathname.startsWith("/api/")) {
          await cache.delete(request);
        }
      }
    }
  })());
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [apiNetworkOnly, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.mode === "navigate";
        },
      },
    ],
  },
});

serwist.addEventListeners();

function storefrontPath(value: unknown) {
  if (typeof value !== 'string') return '/'
  try {
    const decoded = decodeURIComponent(value)
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\') || [...decoded].some(c => c.charCodeAt(0) <= 32)) return '/'
    const u = new URL(value, self.location.origin)
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : '/'
  } catch { return '/' }
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data: Record<string, unknown> = {}
    try { data = event.data?.json() || {} } catch { /* Always show a user-visible fallback. */ }
    const options: NotificationOptions & { image?: string; renotify?: boolean } = {
      body: typeof data.body === 'string' ? data.body.slice(0, 240) : 'Open OWEG for your latest updates.',
      icon: '/icon-192x192.png', badge: '/icon-192x192.png',
      tag: typeof data.tag === 'string' ? data.tag : 'oweg-update', renotify: false,
      data: { url: storefrontPath(data.url), clickToken: typeof data.clickToken === 'string' ? data.clickToken : undefined },
    }
    if (typeof data.image === 'string') {
      if (data.image.startsWith('/') && storefrontPath(data.image) !== '/') options.image = storefrontPath(data.image)
      // Encrypted payloads come from our VAPID sender; remote image origins are validated there.
      else { try { const image = new URL(data.image); if (image.protocol === 'https:' && !image.username && !image.password && !image.hash) options.image = image.href } catch { /* No optional image. */ } }
    }
    await self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 80) : 'OWEG', options)
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(storefrontPath(event.notification.data?.url), self.location.origin).href
  const navigation = (async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = tabs.find(tab => tab.url === url)
    if (existing) await existing.focus()
    else await self.clients.openWindow(url)
  })()
  const token = event.notification.data?.clickToken
  const tracking = typeof token === 'string' && token.length === 36 ? fetch('/api/medusa/push-clicks', {
    method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(2500),
  }) : Promise.resolve()
  event.waitUntil(Promise.allSettled([navigation, tracking]))
})
