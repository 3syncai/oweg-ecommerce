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
  return (
    <section className={styles.inbox} aria-labelledby="notification-heading">
      <header className={styles.header}>
        <div>
          <h1 id="notification-heading">Notifications</h1>
          <p>Offers and updates from OWEG.</p>
        </div>
        <Link href="/account/notifications" className={styles.settings}>
          <Settings size={18} aria-hidden="true" /> Settings
        </Link>
      </header>

      {initializing ? <p role="status" className={styles.empty}>Loading your account…</p> : !customer ? (
        <div className={styles.empty}>
          <span className={styles.badge}><Bell size={25} aria-hidden="true" /></span>
          <h2>Sign in to view your updates</h2>
          <p>See the notifications sent to your OWEG account.</p>
          <Link href="/login?redirect=%2Fnotifications">Sign in</Link>
        </div>
      ) : (
        <>
          {error ? (
            <div className={styles.empty}>
              <p role="alert">{error}</p>
              <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
            </div>
          ) : loading || !current ? (
            <div role="status" aria-label="Loading notifications" className={styles.list}>
              {[0, 1, 2].map(id => <div key={id} className={styles.skeleton} aria-hidden="true" />)}
            </div>
          ) : current.messages.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.badge}><Bell size={25} aria-hidden="true" /></span>
              <h2>You’re all caught up</h2>
              <p>New notifications will appear here when OWEG sends them to your account.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {current.messages.map(message => (
                <article key={message.id} className={styles.message}>
                  <div className={styles.meta}>
                    <span><Bell size={14} aria-hidden="true" /> OWEG</span>
                    {message.sent_at && <time dateTime={message.sent_at}>{new Date(message.sent_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time>}
                  </div>
                  <h2>{message.title}</h2>
                  <p>{message.body}</p>
                  {message.image && <Image className={styles.image} src={message.image} alt="" width={640} height={320} unoptimized />}
                  {message.expired ? <span className={styles.expired}>Offer ended</span> : (
                    <Link className={styles.open} href={message.url} prefetch={false}>View update <ArrowRight size={16} aria-hidden="true" /></Link>
                  )}
                </article>
              ))}
            </div>
          )}

          {(page > 0 || current?.more) && (
            <nav className={styles.pagination} aria-label="Notification pages">
              <button type="button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
              <span>Page {page + 1}</span>
              <button type="button" disabled={loading || Boolean(error) || !current?.more} onClick={() => setPage(value => value + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
