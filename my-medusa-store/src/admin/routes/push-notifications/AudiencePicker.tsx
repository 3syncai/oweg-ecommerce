import { useEffect, useRef, useState } from 'react'
import { getAdminBackendUrl } from '../../lib/admin-backend'
import { getAdminAuthHeaders } from '../../lib/admin-auth-fetch'
import styles from './push.module.css'

type Customer = { id: string; email: string; first_name: string | null; last_name: string | null; devices: number }
export default function AudiencePicker({ ids, onChange, onTest, onBusyChange }: { ids: string[]; onChange: (ids: string[]) => void; onTest: (id: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const generation = useRef(0)
  const [pending, setPending] = useState(0)
  useEffect(() => { onBusyChange(busy || Boolean(pending)); return () => onBusyChange(false) }, [busy,pending,onBusyChange])
  const [reviewOffset, setReviewOffset] = useState(0)
  const reviewStart = Math.min(reviewOffset, Math.floor(Math.max(0,ids.length-1)/50)*50)
  async function fetchCustomers(search: string, start: number, limit: number, signal?: AbortSignal, eligible = false) {
    const params = new URLSearchParams({ q: search, offset: String(start), limit: String(limit), eligible: String(eligible) })
    const response = await fetch(`${getAdminBackendUrl()}/admin/push-notifications/customers?${params}`, { credentials: 'include', cache: 'no-store', headers: getAdminAuthHeaders(), signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || data.message || 'Unable to load customers.')
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
      const selected: Customer[] = []
      let start = 0
      do {
        const data = await fetchCustomers(query, start, size === -1 ? 100 : Math.min(100, size - selected.length), AbortSignal.timeout(12000), true)
        if (generation.current !== current) return
        selected.push(...data.customers)
        start += data.customers.length
        if (!data.customers.length || start >= data.total || (size !== -1 && selected.length >= size)) break
      } while (true)
      onChange([...new Set(selected.map(c => c.id))])
      setLabels(old => ({ ...old, ...Object.fromEntries(selected.map(c => [c.id, c.email])) }))
    } catch (e) { setError((e as Error).message) }
    finally { setPending(0) }
  }
  return <div className={styles.audience}>
    <p><strong>{ids.length} customers selected</strong> · Search includes all active customers. Only subscribed customers can be selected. Each selected customer may have multiple subscribed devices.</p>
    <label>Search customers<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0) }} placeholder="Search by name or email" /></label>
    <div className={styles.actions}>
      {[50,100,-1].map(n => <button key={n} type="button" disabled={busy || Boolean(pending)} onClick={() => void pilot(n)}>{pending === n ? 'Selecting…' : n === -1 ? 'Select all matching subscribed' : `Select first ${n} matching`}</button>)}
      <button type="button" disabled={Boolean(pending) || !ids.length} onClick={() => onChange([])}>Clear selection</button>
    </div>
    <p className={styles.hint}>Choose a 50/100-customer pilot or all matching subscribed customers. There is no 100-customer selection cap. Selection loads in batches and never sends a notification.</p>
    {ids.length > 0 && <details><summary>Review / remove selected customers ({ids.length})</summary><div className={styles.selectedCustomers}>{ids.slice(reviewStart,reviewStart+50).map(id => <button type="button" key={id} onClick={() => onChange(ids.filter(x => x !== id))}>Remove {labels[id] || id} ×</button>)}</div><div className={styles.actions}><button type="button" disabled={reviewStart === 0} onClick={() => setReviewOffset(reviewStart-50)}>Previous selected</button><span>{reviewStart+1}–{Math.min(ids.length,reviewStart+50)} of {ids.length}</span><button type="button" disabled={reviewStart+50 >= ids.length} onClick={() => setReviewOffset(reviewStart+50)}>Next selected</button></div></details>}
    <p role="status">{error || (busy ? 'Loading customers…' : `${total} matching customers`)}</p>
    <div className={styles.customerList} aria-busy={busy}>
      {!busy && rows.map(c => <div className={styles.customerRow} key={c.id}>
        <label><input type="checkbox" checked={ids.includes(c.id)} disabled={Boolean(pending) || c.devices === 0} onChange={e => onChange(e.target.checked ? [...new Set([...ids,c.id])] : ids.filter(id => id !== c.id))} /><span>{[c.first_name,c.last_name].filter(Boolean).join(' ') || 'Customer'}<small>{c.email} · {c.devices > 0 ? `Subscribed · ${c.devices} device${c.devices === 1 ? '' : 's'}` : 'Not subscribed — browser permission required'}</small></span></label>
        <button type="button" disabled={c.devices === 0 || Boolean(pending)} onClick={() => onTest(c.id)}>Use for test</button>
      </div>)}
      {!busy && !rows.length && !error && <p>No customers match this name or email.</p>}
    </div>
    <div className={styles.actions}><button type="button" disabled={busy || offset === 0} onClick={() => setOffset(n => Math.max(0,n-25))}>Previous customers</button><span>Page {offset / 25 + 1}</span><button type="button" disabled={busy || offset + 25 >= total} onClick={() => setOffset(n => n+25)}>Next customers</button></div>
  </div>
}
