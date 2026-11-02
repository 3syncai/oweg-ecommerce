// Serialize local intents and cross-tab reconciliation. Storage is authoritative
// on the backend; this queue is UX ordering, not the atomicity guarantee.
let tail: Promise<unknown> = Promise.resolve()
export function queueWishlist<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work)
  tail = result.catch(() => undefined)
  return result
}
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
export const subscribeWishlist = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const wishlistVersion = () => version
export const wishlistPending = (customerId: string) => [...pending].some(key => key.startsWith(`${customerId}:`))
export function claimWishlist(key: string) {
  if (pending.has(key)) return false
  pending.add(key); version++; listeners.forEach(fn => fn()); return true
}
export function releaseWishlist(key: string) { pending.delete(key); version++; listeners.forEach(fn => fn()) }
export const wishlistIds = (raw: unknown): string[] => Array.isArray(raw) ? [...new Set(raw.filter(id => typeof id === "string" || typeof id === "number").map(String))] : []
