const API = '/api/medusa/push-subscriptions'
/** User-triggered local display check; does not contact the push provider or save data. */
export async function testBrowserNotification() {
  if (Notification.permission !== 'granted') throw new Error('Allow notifications for OWEG in your browser first.')
  const registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration?.active) throw new Error('Reload OWEG to finish activating browser notifications.')
  await registration.showNotification('OWEG browser check', {
    body: 'This checks notification display on this device. No order or wallet data has changed.',
    icon: '/icon-192x192.png', tag: 'oweg-browser-check', data: { url: '/account/notifications' },
  })
  const notifications = await registration.getNotifications({ tag: 'oweg-browser-check' })
  return notifications.length > 0
}
export async function disableBrowserPush() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  // Attempt both independently, so a provider/network failure cannot skip the other cleanup.
  const [browser, server] = await Promise.allSettled([
    subscription.unsubscribe(),
    fetch(API, { method: 'DELETE', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }), signal: AbortSignal.timeout(3000) }),
  ])
  if (server.status === 'rejected' || !server.value.ok) {
    if (browser.status === 'rejected' || !browser.value) throw new Error('Unable to disable notifications. Please retry or disable them in browser settings.')
    throw new Error('Browser disabled. Server preference could not be updated; please retry later.')
  }
}
export async function enableBrowserPush() {
  // Start the prompt before any awaits so Safari retains the user activation.
  const permission = Notification.requestPermission()
  const registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration?.active) throw new Error('Notifications are available on the installed production website. Reload and try again.')
  const response = await fetch(API, { cache: 'no-store', credentials: 'include' })
  const config = await response.json()
  if (!response.ok || !config.configured) throw new Error(config.error || 'Browser notifications are not available yet.')
  // Call only from an explicit user gesture. Never prompt on page opening.
  if (await permission !== 'granted') throw new Error('Permission was not granted. You can change it in your browser settings.')
  const bytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
  try {
    const json = subscription.toJSON()
    const saved = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }), signal: AbortSignal.timeout(8000) })
    const data = await saved.json()
    if (!saved.ok) throw new Error(data.error || 'Unable to save notification preference.')
  } catch (error) { await subscription.unsubscribe(); throw error }
}
