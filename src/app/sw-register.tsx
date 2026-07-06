'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

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
