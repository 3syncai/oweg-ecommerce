'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // An old installed worker can keep serving client chunks from an earlier build.
    // Development must use the dev server's current bundle, never a PWA cache.
    if (process.env.NODE_ENV !== 'production') {
      let cancelled = false
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const local = registrations.filter((registration) =>
          registration.scope.startsWith(`${window.location.origin}/`)
        )
        if (!local.length || cancelled) return
        const controlled = Boolean(navigator.serviceWorker.controller)
        const removed = await Promise.all(local.map((registration) => registration.unregister()))
        if (!cancelled && controlled && removed.some(Boolean)) window.location.reload()
      }).catch((error) => console.warn('[SW] Development cleanup failed', error))
      return () => { cancelled = true }
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is ready; it will activate via skipWaiting.
              console.info('[SW] Update installed and will activate on next navigation.')
            }
          })
        })
      } catch (err) {
        console.error('SW registration failed', err)
      }
    }

    if (document.readyState === 'complete') {
      void register()
    } else {
      window.addEventListener('load', () => void register(), { once: true })
    }
  }, [])

  return null
}
