import { useEffect, useRef, useState } from 'react'
import { getAdminBackendUrl } from '../../lib/admin-backend'
import { getAdminAuthHeaders } from '../../lib/admin-auth-fetch'
import styles from './push.module.css'

type Customer = { id: string; email: string; first_name: string | null; last_name: string | null; devices: number }
export default function AudiencePicker({ ids, onChange, onTest }: { ids: string[]; onChange: (ids: string[]) => void; onTest: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const generation = useRef(0)
  const [pending, setPending] = useState(0)
  async function fetchCustomers(search: string, start: number, limit: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ q: search, offset: String(start), limit: String(limit) })
    const response = await fetch(`${getAdminBackendUrl()}/admin/push-notifications/customers?${params}`, { credentials: 'include', cache: 'no-store', headers: getAdminAuthHeaders(), signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || data.message || 'Unable to load opted-in customers.')
    return data as { customers: Customer[]; total: number }
  }
  useEffect(() => {
    const controller = new AbortController()
    const current = ++generation.current
    setBusy(true); setError('')
    const timer = setTimeout(() => {
      void fetchCustomers(query, offset, 25, controller.signal).then(data => {
        if (generation.current !== current) return
        setRows(data.customers); setTotal(data.total)
        setLabels(old => ({ ...old, ...Object.fromEntries(data.customers.map(c => [c.id, c.email])) }))
      }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message) }).finally(() => { if (generation.current === current) setBusy(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort(); if (generation.current === current) generation.current++ }
  }, [query, offset])
  async function pilot(size: number) {
    if (pending || busy) return
    const current = generation.current
    setPending(size); setError('')
    try {
      const data = await fetchCustomers(query, 0, size, AbortSignal.timeout(12000))
      if (generation.current !== current) return
      onChange(data.customers.map(c => c.id))
      setLabels(old => ({ ...old, ...Object.fromEntries(data.customers.map(c => [c.id, c.email])) }))
    } catch (e) { setError((e as Error).message) }
    finally { setPending(0) }
  }
  return <div className={styles.audience}>
    <p><strong>{ids.length}/100 customers selected</strong> · Only active, opted-in customers appear. Each selected customer may have multiple subscribed devices.</p>
    <label>Search opted-in customers<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0) }} placeholder="Search by name or email" /></label>
    <div className={styles.actions}>
      {[50,100].map(n => <button key={n} type="button" disabled={busy || Boolean(pending)} onClick={() => void pilot(n)}>{pending === n ? 'Selecting…' : `Select first ${n} matching`}</button>)}
      <button type="button" disabled={Boolean(pending) || !ids.length} onClick={() => onChange([])}>Clear selection</button>
    </div>
    <p className={styles.hint}>Pilot buttons replace the selection with up to 50 or 100 matching customers, newest registrations first. They never send a notification.</p>
    {ids.length > 0 && <details><summary>Review / remove selected customers ({ids.length})</summary><div className={styles.selectedCustomers}>{ids.map(id => <button type="button" key={id} onClick={() => onChange(ids.filter(x => x !== id))}>Remove {labels[id] || id} ×</button>)}</div></details>}
    <p role="status">{error || (busy ? 'Loading opted-in customers…' : `${total} matching customers`)}</p>
    <div className={styles.customerList} aria-busy={busy}>
      {!busy && rows.map(c => <div className={styles.customerRow} key={c.id}>
        <label><input type="checkbox" checked={ids.includes(c.id)} disabled={Boolean(pending) || (!ids.includes(c.id) && ids.length >= 100)} onChange={e => onChange(e.target.checked ? [...new Set([...ids,c.id])] : ids.filter(id => id !== c.id))} /><span>{[c.first_name,c.last_name].filter(Boolean).join(' ') || 'Customer'}<small>{c.email} · {c.devices} device{c.devices === 1 ? '' : 's'}</small></span></label>
        <button type="button" onClick={() => onTest(c.id)}>Use for test</button>
      </div>)}
      {!busy && !rows.length && !error && <p>No opted-in customers match. Customers must enable notifications on the storefront first.</p>}
    </div>
    <div className={styles.actions}><button type="button" disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0,n-25))}>Previous customers</button><span>Page {offset / 25 + 1}</span><button type="button" disabled={busy || offset + 25 >= total} onClick={() => setOffset(n => n+25)}>Next customers</button></div>
  </div>
}
