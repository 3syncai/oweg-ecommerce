'use client'
import { useEffect, useState } from 'react'
import { enableBrowserPush, testBrowserNotification } from '@/lib/browser-push'

export default function BrowserPushPreferences() {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let mounted = true
    const available = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(available)
    if (!available) { setBusy(false); return }
    navigator.serviceWorker.getRegistration('/').then(async registration => {
      if (!registration?.active) { if (mounted) setMessage('Browser notifications are available on the production website. Reload after setup.'); return }
      const s = await registration.pushManager.getSubscription()
      const response = await fetch('/api/medusa/push-subscriptions' + (s ? '?endpoint=' + encodeURIComponent(s.endpoint) : ''), { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8000) })
      const data = await response.json()
      if (!response.ok) throw new Error('Unable to read settings')
      if (mounted) { setActive(Boolean(data.active) && Notification.permission === 'granted'); setReady(Boolean(data.configured)); if (!data.configured) setMessage('Browser notifications are being set up. Please try again later.') }
    }).catch(() => { if (mounted) setMessage('Unable to read this browser’s settings.') }).finally(() => { if (mounted) setBusy(false) })
    return () => { mounted = false }
  }, [])
  async function toggle() {
    if (busy || active) return
    setBusy(true); setMessage('')
    try {
      await enableBrowserPush()
      setActive(true)
      setMessage('You’re subscribed to OWEG offers and updates on this browser.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to update notifications.') }
    finally { setBusy(false) }
  }
  async function checkDisplay() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const registered = await testBrowserNotification()
      setMessage(registered
        ? 'Your browser created the test notification. If no popup appears, check your device’s notification centre, Chrome/Edge notification settings and Do Not Disturb.'
        : 'The browser accepted the display request. Check your device’s notification centre and notification settings if nothing appeared.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to display a browser notification.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6" aria-labelledby="browser-push-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl"><h2 id="browser-push-title" className="text-lg font-semibold">Browser notifications</h2>
        <p className="mt-1 text-sm text-gray-600">Get OWEG offers and updates even when the website is closed. Optional, and specific to this browser. You can turn them off any time.</p>
      </div>
      <button type="button" onClick={() => void toggle()} disabled={busy || active || !supported || (!ready && !active)} className="shrink-0 rounded-full bg-[#155344] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Please wait…' : active ? 'Enabled in this browser' : ready ? 'Enable notifications' : 'Not available yet'}
      </button>
    </div>
    {active && <p className="mt-3 text-sm text-gray-600">To stop notifications, change OWEG’s notification permission in your browser or device settings.</p>}
    {active && <button type="button" disabled={busy} onClick={() => void checkDisplay()} className="mt-4 rounded-full border border-[#155344] px-5 py-2 text-sm font-semibold text-[#155344] disabled:opacity-50">Test notification on this device</button>}
    {!supported && <p className="mt-3 text-sm text-gray-600">On iPhone/iPad, add OWEG to your Home Screen and open it there (iOS 16.4 or later). Otherwise use a browser that supports Web Push.</p>}
    <p role="status" aria-live="polite" className="mt-3 text-sm text-[#155344]">{message}</p>
  </section>
}
