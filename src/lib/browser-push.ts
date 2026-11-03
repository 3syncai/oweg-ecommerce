const API = '/api/medusa/push-subscriptions'
let subscriptionEpoch = 0
let setupSuspended = false
/** Called only after AuthProvider exposes a signed-in session. */
export function resumeBrowserPushSession() { setupSuspended = false }
const pending = new Map<string, Promise<void>>()
type PushOptions = { customerId?: string; signal?: AbortSignal }
function assertCurrent(epoch: number, signal?: AbortSignal) {
  if (setupSuspended || epoch !== subscriptionEpoch || signal?.aborted) throw new Error('Notification setup cancelled. Please try again.')
}
function updated() { window.dispatchEvent(new Event('oweg:push-updated')) }
/** Wait a bounded time for a newly installed PWA's service worker, without blocking rendering. */
export async function activePushRegistration(signal?: AbortSignal) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (signal?.aborted) return null
    const registration = await navigator.serviceWorker.getRegistration('/')
    if (registration?.active) return registration
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); signal?.removeEventListener('abort',done); resolve() }
      const timer = setTimeout(done, 1000)
      signal?.addEventListener('abort',done,{ once: true })
    })
  }
  return null
}
/** User-triggered local display check; no push provider or data writes. */
export async function testBrowserNotification() {
  if (Notification.permission !== 'granted') throw new Error('Allow notifications for OWEG in your browser first.')
  const registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration?.active) throw new Error('Reload OWEG to finish activating browser notifications.')
  await registration.showNotification('OWEG browser check', {
    body: 'This checks notification display on this device. No order or wallet data has changed.',
    icon: '/icon-192x192.png', tag: 'oweg-browser-check', data: { url: '/account/notifications' },
  })
  return (await registration.getNotifications({ tag: 'oweg-browser-check' })).length > 0
}
export async function disableBrowserPush() {
  setupSuspended = true
  subscriptionEpoch++
  pending.clear()
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) return
  const [browser, server] = await Promise.allSettled([
    subscription.unsubscribe(),
    fetch(API, { method: 'DELETE', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }), signal: AbortSignal.timeout(3000) }),
  ])
  updated()
  if (server.status === 'rejected' || !server.value.ok) {
    if (browser.status === 'rejected' || !browser.value) throw new Error('Unable to disable notifications. Please retry or disable them in browser settings.')
    throw new Error('Browser disabled. Server preference could not be updated; please retry later.')
  }
}
/** Native permission is requested synchronously from the Enable click, and never requested again when granted. */
export function enableBrowserPush(options: PushOptions = {}): Promise<void> {
  const key = options.customerId || 'manual'
  const existing = pending.get(key)
  if (existing) return existing
  const epoch = subscriptionEpoch
  assertCurrent(epoch,options.signal)
  const permission = Notification.permission === 'granted' ? Promise.resolve('granted' as NotificationPermission) : Notification.requestPermission()
  const operation = (async () => {
    // Always consume a rejected permission promise, even if SW/config fails first.
    const granted = await permission
    assertCurrent(epoch,options.signal)
    if (granted !== 'granted') throw new Error('Permission was not granted. You can change it in your browser settings.')
    const registration = await activePushRegistration(options.signal)
    assertCurrent(epoch,options.signal)
    if (!registration) throw new Error('Reload OWEG to finish setting up browser notifications.')
    const response = await fetch(API, { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8000) })
    const config = await response.json()
    assertCurrent(epoch,options.signal)
    if (!response.ok || !config.configured) throw new Error(config.error || 'Browser notifications are not available yet.')
    if (options.customerId && config.customer_id !== options.customerId) throw new Error('Account changed. Please retry notification setup.')
    const previous = await registration.pushManager.getSubscription()
    assertCurrent(epoch,options.signal)
    if (previous && config.active) return
    const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
    const subscription = previous || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
    let conflict = false
    try {
      assertCurrent(epoch,options.signal)
      const json = subscription.toJSON()
      const saved = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...(options.customerId ? { expected_customer_id: options.customerId } : {}) }), signal: AbortSignal.timeout(8000) })
      const data = await saved.json()
      conflict = saved.status === 409
      assertCurrent(epoch,options.signal)
      if (!saved.ok) throw new Error(data.error || 'Unable to save notification preference.')
      updated()
    } catch (error) {
      if (!previous || conflict || epoch !== subscriptionEpoch || options.signal?.aborted) await subscription.unsubscribe().catch(()=>undefined)
      throw error
    }
  })()
  pending.set(key,operation)
  const clear = () => { if (pending.get(key) === operation) pending.delete(key) }
  void operation.then(clear,clear)
  return operation
}
/** Restore an already-granted device after login; never displays a native permission prompt. */
export async function restoreBrowserPush(customerId: string, signal?: AbortSignal) {
  if (Notification.permission !== 'granted') return false
  const epoch = subscriptionEpoch
  assertCurrent(epoch,signal)
  const registration = await activePushRegistration(signal)
  assertCurrent(epoch,signal)
  if (!registration) return false
  const subscription = await registration.pushManager.getSubscription()
  assertCurrent(epoch,signal)
  const response = await fetch(API + (subscription ? '?endpoint='+encodeURIComponent(subscription.endpoint) : ''), { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) })
  const state = await response.json()
  assertCurrent(epoch,signal)
  if (!response.ok || !state.configured || state.customer_id !== customerId) return false
  if (!subscription || !state.active) await enableBrowserPush({ customerId, signal })
  return true
}
