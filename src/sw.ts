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
