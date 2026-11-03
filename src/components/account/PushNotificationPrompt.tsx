'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthProvider'
import { isStandalonePwa } from '@/lib/open-storefront-link'
import { activePushRegistration, enableBrowserPush, restoreBrowserPush, resumeBrowserPushSession } from '@/lib/browser-push'
import styles from './PushNotificationPrompt.module.css'

const DISMISSED = 'oweg.push.onboarding.dismissed.v1'
function dismissed() { try { return localStorage.getItem(DISMISSED) === '1' } catch { return false } }
function rememberDismissal() { try { localStorage.setItem(DISMISSED,'1') } catch { /* Storage may be unavailable. */ } }
function supported() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return !ios || isStandalonePwa()
}

/** One device-level opt-in, discoverable on first PWA opening or after sign-in. */
export default function PushNotificationPrompt() {
  const { customer, initializing } = useAuth()
  const customerId = customer?.id
  const pathname = usePathname() || '/'
  const [visible,setVisible] = useState(false)
  const [busy,setBusy] = useState(false)
  const [guestAllowed,setGuestAllowed] = useState(false)
  const [message,setMessage] = useState('')
  const lock = useRef(false)
  const lastSync = useRef({ id: '', at: 0 })
  const suppressed = /^\/(checkout|cart|login|signup|order|orders|account\/notifications)(\/|$)/.test(pathname)
  const shown = visible && !suppressed

  useEffect(() => {
    if (initializing || !supported()) return
    if (customerId) resumeBrowserPushSession()
    lastSync.current = { id: '', at: 0 }
    const controller = new AbortController()
    let running = false
    setVisible(false); setMessage(''); setGuestAllowed(false)
    async function check() {
      if (running || lock.current || controller.signal.aborted || (!customerId && !isStandalonePwa())) return
      running = true
      try {
        if (Notification.permission === 'denied') { setVisible(false); return }
        if (!await activePushRegistration(controller.signal) || controller.signal.aborted) return
        if (Notification.permission === 'granted') {
          setVisible(false)
          if (customerId && (lastSync.current.id !== customerId || Date.now()-lastSync.current.at > 60000)) {
            lastSync.current = { id: customerId, at: Date.now() }
            await restoreBrowserPush(customerId,controller.signal)
          }
          return
        }
        if (dismissed()) return
        if (customerId) {
          const response = await fetch('/api/medusa/push-subscriptions',{ credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) })
          const state = await response.json()
          if (!response.ok || !state.configured || state.customer_id !== customerId) return
        }
        if (!controller.signal.aborted && Notification.permission === 'default') setVisible(true)
      } catch { /* Background setup must not interrupt browsing or login. Settings allow an explicit retry. */ }
      finally { running = false }
    }
    const timer = setTimeout(()=>void check(),1200)
    const onFocus = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onFocus)
    window.addEventListener('appinstalled',onFocus)
    const onStorage = (event: StorageEvent) => { if (event.key === DISMISSED && event.newValue === '1') setVisible(false) }
    window.addEventListener('storage',onStorage)
    const onPushUpdated = () => { if (Notification.permission === 'granted') setVisible(false) }
    window.addEventListener('oweg:push-updated',onPushUpdated)
    return () => { clearTimeout(timer); controller.abort(); window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onFocus); window.removeEventListener('appinstalled',onFocus); window.removeEventListener('storage',onStorage); window.removeEventListener('oweg:push-updated',onPushUpdated) }
  },[customerId,initializing])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('oweg:notification-prompt',{ detail: shown }))
    return () => { window.dispatchEvent(new CustomEvent('oweg:notification-prompt',{ detail: false })) }
  },[shown])

  async function enable() {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      if (customerId) {
        // This call starts the native prompt in the original click handler.
        await enableBrowserPush({ customerId })
        setVisible(false)
      } else {
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
        if (permission !== 'granted') { rememberDismissal(); setVisible(false); return }
        setGuestAllowed(true)
        setMessage('Permission allowed on this device. Sign in to receive your OWEG notifications.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to enable notifications. Please retry.') }
    finally { lock.current = false; setBusy(false) }
  }
  function later() { if (busy) return; rememberDismissal(); setVisible(false) }
  if (!shown) return null
  return <section className={styles.card} role="region" aria-labelledby="push-onboarding-title">
    <Image src="/icons/brand/oweg-wordmark.svg" width={76} height={22} alt="OWEG" unoptimized />
    <h2 id="push-onboarding-title">Stay in the loop with OWEG</h2>
    <p>Enable offers and updates with one notification permission on this device. You can turn them off in browser or device settings.</p>
    <p role="status" aria-live="polite" className={styles.message}>{message}</p>
    <div className={styles.actions}>
      {guestAllowed ? <Link href="/login?redirect=%2Faccount%2Fnotifications">Sign in to finish</Link> : <button type="button" className={styles.enable} disabled={busy} onClick={()=>void enable()}>{busy ? 'Enabling…' : 'Enable notifications'}</button>}
      <button type="button" disabled={busy} onClick={later}>Not now</button>
    </div>
    <Link className={styles.settings} href="/account/notifications" onClick={()=>setVisible(false)}>Notification settings</Link>
  </section>
}
