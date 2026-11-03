'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Bell, Settings, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthProvider'
import styles from './NotificationInbox.module.css'

type Message = { id: string; title: string; body: string; url: string; image: string | null; sent_at: string | null; expired: boolean }
export default function NotificationInbox() {
  const { customer, initializing } = useAuth()
  const [page, setPage] = useState(0)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<{ customer: string; page: number; messages: Message[]; more: boolean } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const customerId = customer?.id
  useEffect(() => { setPage(0); setState(null) }, [customerId])
  useEffect(() => {
    if (initializing || !customerId) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/medusa/push-inbox?offset=${page * 20}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Unable to load notifications. Please try again.'); return response.json() })
      .then(data => { if (!controller.signal.aborted) setState({ customer: customerId, page, messages: data.notifications, more: data.has_more }) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [customerId, initializing, page, retry])
  const current = state && state.customer === customerId && state.page === page ? state : null
  return <main className={styles.inbox}>
    <header className={styles.header}><div><span className={styles.eyebrow}>YOUR OWEG UPDATES</span><h1>Notifications</h1><p>Missed a notification? Catch up on offers and updates sent to you.</p></div><Link href="/account/notifications" className={styles.settings}><Settings size={18} />Settings</Link></header>
    {initializing ? <p role="status">Loading your account…</p> : !customer ? <div className={styles.empty}><Bell size={32}/><h2>Your updates, in one place</h2><p>Sign in to see notifications sent to your account.</p><Link href="/login?redirect=%2Fnotifications">Sign in</Link></div> : <>
      {error ? <div role="alert" className={styles.empty}><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div> : loading || !current ? <div role="status" aria-label="Loading notifications" className={styles.list}>{[0,1,2].map(id => <div key={id} className={styles.skeleton}/>)}</div> : current.messages.length === 0 ? <div className={styles.empty}><Bell size={32}/><h2>You’re all caught up</h2><p>Notifications sent to you will appear here. Enable browser notifications in Settings to receive new updates.</p><Link href="/account/notifications">Notification settings</Link></div> : <div className={styles.list}>{current.messages.map(message => <article key={message.id} className={styles.message}>
        <div className={styles.meta}><span>OWEG</span>{message.sent_at && <time dateTime={message.sent_at}>{new Date(message.sent_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time>}</div>
        <h2>{message.title}</h2><p>{message.body}</p>
        {message.image && <Image className={styles.image} src={message.image} alt="" width={640} height={320} unoptimized />}
        {message.expired ? <span className={styles.expired}>Offer ended</span> : <Link className={styles.open} href={message.url}>View update<ArrowRight size={16}/></Link>}
      </article>)}</div>}
      <nav className={styles.pagination} aria-label="Notification pages"><button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={loading || Boolean(error) || !current?.more} onClick={() => setPage(value => value + 1)}>Next</button></nav>
      <p className={styles.note}>The same message appears once, even if sent to multiple devices. Older notification history is periodically removed.</p>
    </>}
  </main>
}
