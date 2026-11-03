import { defineRouteConfig } from '@medusajs/admin-sdk'
import { BellAlert } from '@medusajs/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getAdminBackendUrl } from '../../lib/admin-backend'
import { getAdminAuthHeaders } from '../../lib/admin-auth-fetch'
import { withAdminPageAccess } from '../../lib/with-admin-page-access'
import styles from './push.module.css'
import AudiencePicker from './AudiencePicker'
import owegWordmark from '../../assets/oweg-wordmark.svg'

type Draft = { title: string; body: string; url: string; image: string; audience: string[]; audience_mode?: 'all' | 'selected'; expires_at: string }
type Campaign = Draft & { id: string; revision: number; status: string; accepted: number; failed: number; clicked: number; recipients: number; scheduled_at: string | null }
type Listing = { campaigns: Campaign[]; total: number; subscribers: number; configured: boolean; enabled: boolean; workerHealthy: boolean }
const fresh = (): Draft => ({ title: '', body: '', url: '/', image: '', audience: [], audience_mode: 'selected', expires_at: new Date(Date.now() + 86400000).toISOString() })
async function request(body?: unknown, offset = 0) {
  const response = await fetch(`${getAdminBackendUrl()}/admin/push-notifications?offset=${offset}`, {
    method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
    headers: getAdminAuthHeaders(body ? { 'content-type': 'application/json' } : undefined),
    signal: AbortSignal.timeout(12000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || data.message || 'Unable to load notifications. Has the push migration been installed?')
  return data
}

function PushNotifications() {
  const [draft, setDraft] = useState<Draft>(fresh)
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [list, setList] = useState<Listing | null>(null)
  const [offset, setOffset] = useState(0)
  const [preview, setPreview] = useState('Mobile')
  const [busy, setBusy] = useState(false)
  const actionLock = useRef(false)
  const [audienceBusy, setAudienceBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [schedule, setSchedule] = useState('')
  const [testCustomer, setTestCustomer] = useState('')
  const [confirm, setConfirm] = useState<'send' | 'schedule' | 'test' | null>(null)
  const [dirty, setDirty] = useState(false)
  const load = useCallback(async () => {
    try { setList(await request(undefined, offset)) } catch (error) { setMessage((error as Error).message) }
  }, [offset])
  useEffect(() => { void load() }, [load])
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(d => ({ ...d, [key]: value })); setDirty(true); setConfirm(null) }
  async function upload(file: File | undefined) {
    if (!file || busy || actionLock.current) return
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setMessage('Choose a PNG, JPEG or WebP image up to 2 MB.'); return }
    actionLock.current = true; setBusy(true); setMessage('Uploading image…')
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch(`${getAdminBackendUrl()}/admin/push-notifications/images`, { method: 'POST', credentials: 'include', headers: getAdminAuthHeaders(), body, signal: AbortSignal.timeout(20000) })
      const data = await response.json()
      if (!response.ok || typeof data.image?.url !== 'string') throw new Error(data.error || 'Image upload failed. Please retry.')
      update('image', data.image.url); setMessage('Image uploaded. Save the draft to keep it.')
    } catch (error) { setMessage((error as Error).message) }
    finally { actionLock.current = false; setBusy(false) }
  }
  async function run(action: string, target = selected) {
    if (busy || actionLock.current) return
    if (action === 'save' && audienceBusy) return
    if (action === 'save' && draft.audience_mode === 'selected' && !draft.audience.length) { setMessage('Select at least one opted-in customer, or explicitly choose All opted-in browsers.'); return }
    actionLock.current = true; setBusy(true); setMessage(''); setConfirm(null)
    try {
      const result = await request({ action, ...(target ? { id: target.id, revision: target.revision } : {}),
        ...(['save','test'].includes(action) ? { campaign: action === 'test' ? { ...draft, audience: [testCustomer], audience_mode: 'selected' } : draft } : {}),
        ...(action === 'schedule' ? { scheduled_at: new Date(schedule).toISOString() } : {}),
        ...(action === 'test' ? { test_customer: testCustomer } : {}),
      })
      if (action === 'save') { setSelected(result.campaign); setDirty(false) }
      else if (action !== 'test') { setSelected(null); setDraft(fresh()); setDirty(false) }
      setMessage(action === 'save' ? 'Draft saved.' : action === 'cancel' ? 'Unsent notifications cancelled. Provider-accepted notifications cannot be recalled.' : 'Queued. The background job will process this; refresh history to check provider acceptance.')
      await load()
    } catch (error) { setMessage((error as Error).message) }
    finally { actionLock.current = false; setBusy(false) }
  }
  async function prepare(action: 'send' | 'schedule') {
    if (busy || actionLock.current || audienceBusy) return
    if (draft.audience_mode === 'selected' && !draft.audience.length) { setMessage('Select at least one opted-in customer, or explicitly choose All opted-in browsers.'); return }
    actionLock.current = true; setBusy(true); setMessage(''); setConfirm(null)
    try {
      if (!selected || dirty) {
        const result = await request({ action: 'save', ...(selected ? { id: selected.id, revision: selected.revision } : {}), campaign: draft })
        setSelected(result.campaign); setDirty(false)
        await load()
      }
      setConfirm(action)
    } catch (error) { setMessage((error as Error).message) }
    finally { actionLock.current = false; setBusy(false) }
  }
  const editable = !selected || selected.status === 'draft'
  const canSend = list?.configured && list.enabled && editable && !audienceBusy
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CUSTOMER ENGAGEMENT</p><h1>Browser notifications</h1><p>Thoughtful messages. The right moment. One OWEG experience.</p></div>
      <button onClick={() => { setSelected(null); setDraft(fresh()); setDirty(false); setConfirm(null) }} disabled={busy}>New notification</button></header>
    <div className={styles.stats}><span><strong>{list?.subscribers ?? '—'}</strong> opted-in browsers</span><span>{list?.configured ? 'VAPID configured' : 'VAPID not configured'}</span><span>{list?.enabled ? 'Background sending enabled' : 'Sending disabled'}</span><span>{list?.workerHealthy ? 'Notification worker healthy' : 'Notification worker waiting / offline'}</span></div>
    <div className={styles.workspace}>
      <section className={styles.panel}><h2>{selected ? 'Notification details' : 'Create a notification'}</h2>
        <fieldset disabled={!editable || busy} className={styles.form}>
          <label>Title <small>{draft.title.length}/80</small><input maxLength={80} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="A little treat for your home ✨" /></label>
          <label>Message <small>{draft.body.length}/240</small><textarea maxLength={240} rows={3} value={draft.body} onChange={e => update('body', e.target.value)} placeholder="Your next favourite find is waiting. Explore today’s picks." /></label>
          <label>Open this storefront path<input value={draft.url} onChange={e => update('url', e.target.value)} placeholder="/flash-sale" /></label>
          <label>Optional image URL or storefront path<input value={draft.image} onChange={e => update('image', e.target.value)} placeholder="/page-banners/offer.webp" /></label>
          <label>Upload campaign image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
          <p className={styles.hint}>PNG, JPEG or WebP, up to 2 MB. Images are stored under notifications/YYYY/MM/DD/ with unique UTC timestamped filenames. The OWEG app icon is added automatically.</p>
          <label>Audience<select value={draft.audience_mode || (draft.audience.length ? 'selected' : 'all')} onChange={e => { update('audience_mode', e.target.value as 'all' | 'selected'); update('audience', []) }}><option value="selected">Selected customers — pilot / targeted send</option><option value="all">All opted-in browsers</option></select></label>
          {(draft.audience_mode === 'selected' || draft.audience.length > 0) && <AudiencePicker ids={draft.audience} onChange={ids => update('audience', ids)} onTest={setTestCustomer} onBusyChange={setAudienceBusy} />}
          {draft.audience_mode === 'all' && <p className={styles.hint}>Broad audience: all eligible opted-in browsers. Choose Selected customers for a 50–100 customer pilot.</p>}
          <label>Stop showing after<input type="datetime-local" value={toLocal(draft.expires_at)} onChange={e => { if (e.target.value) update('expires_at', new Date(e.target.value).toISOString()) }} /></label>
        </fieldset>
        <div className={styles.actions}><button disabled={busy || audienceBusy || !editable} onClick={() => void run('save')}>Save draft</button>
          <button className={styles.primary} disabled={busy || !canSend} onClick={() => void prepare('send')}>Review & send</button></div>
        <p role="status" aria-live="polite" className={styles.message}>{message}</p>
        {audienceBusy && <p className={styles.hint}>Wait for customer selection to finish before saving or sending.</p>}
        {dirty && <p className={styles.hint}>Review & send saves your changes first, then asks for confirmation. No notification is sent until you confirm.</p>}
        {!list?.configured && <p className={styles.hint}>Sending unavailable: configure VAPID keys on the backend.</p>}
        {list?.configured && !list.enabled && <p className={styles.hint}>Sending is disabled on the backend. Drafts can still be saved.</p>}
        <div className={styles.form}><label>Schedule (your local time)<input type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} /></label>
          <button disabled={busy || !canSend || !schedule} onClick={() => void prepare('schedule')}>Review schedule</button>
          <label>Test customer ID<input value={testCustomer} onChange={e => setTestCustomer(e.target.value)} placeholder="cus_… (must opt in first on the storefront)" /></label>
          <button disabled={busy || !editable || !list?.enabled || !list.configured || !testCustomer} onClick={() => setConfirm('test')}>Send a test</button></div>
        {confirm && <div className={styles.confirm} role="alert"><strong>{confirm === 'test' ? `Send to test customer ${testCustomer}?` : `Queue ${draft.audience.length ? draft.audience.length + ' selected customers’ opted-in browsers' : 'all opted-in browsers'}?`}</strong>
          <p>{draft.title} · {confirm === 'schedule' ? schedule : 'Next background batch'}. This action sends a real notification.</p>
          <button className={styles.primary} disabled={busy} onClick={() => void run(confirm)}>Confirm {confirm}</button><button onClick={() => setConfirm(null)}>Go back</button></div>}
      </section>
      <aside className={styles.preview}><div className={styles.tabs}>{['Mobile','Tablet','Desktop'].map(device => <button key={device} aria-pressed={preview === device} onClick={() => setPreview(device)}>{device}</button>)}</div>
        <div className={`${styles.device} ${preview === 'Desktop' ? styles.desktop : preview === 'Tablet' ? styles.tablet : ''}`}>
          <p className={styles.clock}>9:41</p><div className={styles.notification}><div className={styles.brand}><img className={styles.wordmark} src={owegWordmark} alt="OWEG" /><small>now</small></div>
            <h3>{draft.title || 'A little treat for your home ✨'}</h3><p>{draft.body || 'Your next favourite find is waiting. Explore today’s picks.'}</p>
            {draft.image && <img src={draft.image.startsWith('/') && !draft.image.startsWith('//') ? `https://www.0weg.in${draft.image}` : draft.image.startsWith('https://') ? draft.image : 'https://www.0weg.in/icon-192x192.png'} alt="Notification image preview" />}
            <span className={styles.open}>Tap to explore →</span></div></div>
        <p className={styles.hint}>Illustrative preview. Your customer’s browser and operating system control the final appearance, images and actions. iPhone requires a Home Screen web app.</p>
        <div className={styles.note}><strong>Permission comes first</strong><p>Only customers who explicitly enable browser notifications receive these messages. Signing out disables this browser subscription.</p></div>
      </aside>
    </div>
    <section className={styles.panel}><div className={styles.header}><div><h2>Campaign history</h2><p>Accepted means the push provider accepted the message. It does not confirm display or reading.</p></div><button disabled={busy} onClick={() => void load()}>Refresh status</button></div>
      <div className={styles.history}>{list?.campaigns.map(c => <article key={c.id}><div><strong>{c.title}</strong><p>{c.status} · {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : 'Draft'}</p><small>{c.recipients} queued · {c.accepted} provider accepted · {c.failed} failed · {c.clicked || 0} clicked</small></div>
        <div className={styles.actions}><button disabled={busy} onClick={() => { setSelected(c); setDraft({ title: c.title, body: c.body, url: c.url, image: c.image || '', audience: c.audience, audience_mode: c.audience.length ? 'selected' : 'all', expires_at: c.expires_at }); setDirty(false); setConfirm(null) }}>Details</button>
          {['draft','scheduled','sending'].includes(c.status) && <button disabled={busy} onClick={() => void run('cancel', c)}>Cancel unsent</button>}</div></article>)}</div>
      {!list?.campaigns.length && <p className={styles.hint}>No campaigns yet. Save your first draft above.</p>}
      <div className={styles.actions}><button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button><span>Page {offset / 25 + 1}</span><button disabled={busy || (list?.campaigns.length || 0) < 25} onClick={() => setOffset(offset + 25)}>Next</button></div>
    </section>
  </main>
}
function toLocal(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16) }
export const config = defineRouteConfig({ label: 'Browser notifications', icon: BellAlert })
export default withAdminPageAccess(PushNotifications, '/push-notifications')
