import { randomUUID } from 'node:crypto'
import webpush from 'web-push'
import type { Pool } from 'pg'
import { getSharedDbPool } from '../db-pool'
import { fcmConfigured, sendFcmMessage } from './fcm'
import { retryDelay, safeEndpoint } from './validation'

export function pushConfigured() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || ''
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || ''
  return /^[A-Za-z0-9_-]+$/.test(publicKey) && Buffer.from(publicKey, 'base64url').length === 65 &&
    /^[A-Za-z0-9_-]+$/.test(privateKey) && Buffer.from(privateKey, 'base64url').length === 32 &&
    /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(process.env.WEB_PUSH_SUBJECT || '')
}

export function pushDispatchEnabled() {
  const web = pushConfigured() && process.env.WEB_PUSH_ENABLED === 'true'
  const native = fcmConfigured() && process.env.FCM_PUSH_ENABLED === 'true'
  return web || native
}

/** Keep terminal notification history for 90 days; never touch commerce rows. */
export async function cleanupPushHistory(pool: Pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(74638292) AS locked')
    if (!lock.rows[0].locked) { await client.query('ROLLBACK'); return { skipped: true } }
    const deliveries = await client.query(`DELETE FROM oweg_push_delivery WHERE id IN (
      SELECT d.id FROM oweg_push_delivery d JOIN oweg_push_campaign c ON c.id=d.campaign_id
      WHERE c.status IN ('completed','cancelled') AND c.expires_at<now() AND c.updated_at<now()-interval '90 days'
      ORDER BY c.updated_at LIMIT 1000)`)
    const campaigns = await client.query(`DELETE FROM oweg_push_campaign WHERE id IN (
      SELECT c.id FROM oweg_push_campaign c WHERE c.status IN ('completed','cancelled') AND c.expires_at<now()
      AND c.updated_at<now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM oweg_push_delivery d WHERE d.campaign_id=c.id)
      ORDER BY c.updated_at LIMIT 100)`)
    await client.query(`UPDATE oweg_push_subscription SET active=false,updated_at=now() WHERE id IN (
      SELECT s.id FROM oweg_push_subscription s WHERE s.active AND NOT EXISTS(SELECT 1 FROM customer c WHERE c.id=s.customer_id AND c.deleted_at IS NULL) LIMIT 500)`)
    const subscriptions = await client.query(`DELETE FROM oweg_push_subscription WHERE id IN (
      SELECT s.id FROM oweg_push_subscription s WHERE NOT s.active AND s.updated_at<now()-interval '90 days'
      AND NOT EXISTS(SELECT 1 FROM oweg_push_delivery d WHERE d.subscription_id=s.id) ORDER BY s.updated_at LIMIT 500)`)
    await client.query('COMMIT')
    return { deliveries: deliveries.rowCount, campaigns: campaigns.rowCount, subscriptions: subscriptions.rowCount }
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

/** Bounded DB-backed queue. No network calls inside a database transaction. */
export async function dispatchPushBatch(workerPool?: Pool) {
  if (!pushDispatchEnabled()) return { disabled: true }
  const webEnabled = pushConfigured() && process.env.WEB_PUSH_ENABLED === 'true'
  const fcmEnabled = fcmConfigured() && process.env.FCM_PUSH_ENABLED === 'true'
  const pool = workerPool || getSharedDbPool()
  // A dedicated connection owns the advisory lock, including across HTTP awaits.
  const guard = await pool.connect()
  let ownsLock = false
  try {
    const locked = await guard.query('SELECT pg_try_advisory_lock(74638292) AS locked')
    if (!locked.rows[0].locked) return { skipped: true }
    ownsLock = true
    await pool.query(`UPDATE oweg_push_campaign SET status='completed',updated_at=now()
      WHERE status IN ('scheduled','sending') AND expires_at<=now()`)
    await pool.query(`UPDATE oweg_push_delivery d SET status='cancelled',lease_token=NULL
      FROM oweg_push_campaign c WHERE d.campaign_id=c.id AND c.status IN ('cancelled','completed') AND d.status IN ('pending','sending')`)
    const due = await pool.query(`SELECT * FROM oweg_push_campaign WHERE status IN ('scheduled','sending')
      AND scheduled_at<=now() AND expires_at>now() ORDER BY scheduled_at LIMIT 2`)
    for (const campaign of due.rows) {
      if (!campaign.prepared) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const current = await client.query(`SELECT * FROM oweg_push_campaign WHERE id=$1 AND status IN ('scheduled','sending') FOR UPDATE`, [campaign.id])
          if (current.rowCount) {
            const c = current.rows[0]
            const snapshot = c.snapshot_at || new Date()
            const recipients = await client.query(`SELECT s.id FROM oweg_push_subscription s JOIN customer account ON account.id=s.customer_id AND account.deleted_at IS NULL
              WHERE s.active AND s.installed_app AND s.created_at<=$1 AND ($2::uuid IS NULL OR s.id>$2)
              AND (jsonb_array_length($3::jsonb)=0 OR s.customer_id IN (SELECT jsonb_array_elements_text($3::jsonb)))
              ORDER BY s.id LIMIT 250`, [snapshot, c.cursor_id, JSON.stringify(c.audience)])
            if (recipients.rows.length) await client.query(`INSERT INTO oweg_push_delivery(id,campaign_id,subscription_id,click_token)
              SELECT unnest($1::uuid[]),$2::uuid,unnest($3::uuid[]),unnest($4::uuid[]) ON CONFLICT DO NOTHING`,
              [recipients.rows.map(() => randomUUID()), c.id, recipients.rows.map(s => s.id), recipients.rows.map(() => randomUUID())])
            await client.query(`UPDATE oweg_push_campaign SET status='sending',snapshot_at=$2,cursor_id=$3,prepared=$4,updated_at=now() WHERE id=$1`,
              [c.id, snapshot, recipients.rows.at(-1)?.id || c.cursor_id, recipients.rows.length < 250])
          }
          await client.query('COMMIT')
        } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
      }
    }
    const token = randomUUID()
    const claimed = await pool.query(`WITH batch AS (
      SELECT d.id FROM oweg_push_delivery d JOIN oweg_push_campaign c ON c.id=d.campaign_id
      WHERE c.status='sending' AND c.expires_at>now() AND d.attempts<5
      AND ((d.status='pending' AND d.next_attempt<=now()) OR (d.status='sending' AND d.lease_until<now()))
      ORDER BY d.next_attempt FOR UPDATE OF d SKIP LOCKED LIMIT 10
    ) UPDATE oweg_push_delivery d SET status='sending',attempts=d.attempts+1,lease_token=$1,lease_until=now()+interval '2 minutes'
      FROM batch WHERE d.id=batch.id RETURNING d.id`, [token])
    const deliver = async (item: { id: string }) => {
      const result = await pool.query(`SELECT d.*,c.title,c.body,c.url,c.image,c.expires_at,s.endpoint,s.p256dh,s.auth,s.active,s.installed_app,s.provider,s.platform,c.status AS campaign_status,
        EXISTS(SELECT 1 FROM customer account WHERE account.id=s.customer_id AND account.deleted_at IS NULL) AS customer_exists
        FROM oweg_push_delivery d JOIN oweg_push_campaign c ON c.id=d.campaign_id JOIN oweg_push_subscription s ON s.id=d.subscription_id
        WHERE d.id=$1 AND d.lease_token=$2`, [item.id, token])
      const d = result.rows[0]
      if (!d) return
      if (!d.active || !d.installed_app || !d.customer_exists || d.campaign_status !== 'sending' || new Date(d.expires_at).getTime() <= Date.now() || !safeEndpoint(d.endpoint)) {
        await pool.query(`UPDATE oweg_push_delivery SET status='cancelled',lease_token=NULL,
          attempts=CASE WHEN $3::boolean THEN attempts-1 ELSE attempts END
          WHERE id=$1 AND lease_token=$2`, [d.id, token, !d.installed_app]); return
      }
      const provider = d.provider === 'fcm' || String(d.endpoint).startsWith('fcm:') ? 'fcm' : 'web_push'
      if (provider === 'fcm' && !fcmEnabled) {
        await pool.query(`UPDATE oweg_push_delivery SET status='cancelled',lease_token=NULL,error_code='FCM_DISABLED' WHERE id=$1 AND lease_token=$2`, [d.id, token]); return
      }
      if (provider === 'web_push' && !webEnabled) {
        await pool.query(`UPDATE oweg_push_delivery SET status='cancelled',lease_token=NULL,error_code='WEB_PUSH_DISABLED' WHERE id=$1 AND lease_token=$2`, [d.id, token]); return
      }
      try {
        const ttl = Math.max(1, Math.min(86400, Math.floor((new Date(d.expires_at).getTime() - Date.now()) / 1000)))
        const tag = `oweg-${d.campaign_id}`
        if (provider === 'fcm') {
          const deviceToken = String(d.endpoint).startsWith('fcm:') ? String(d.endpoint).slice(4) : String(d.endpoint)
          await sendFcmMessage({
            token: deviceToken,
            title: d.title,
            body: d.body,
            url: d.url,
            image: d.image,
            tag,
            clickToken: d.click_token,
            ttlSeconds: ttl,
          })
        } else {
          const payload = JSON.stringify({ title: d.title, body: d.body, url: d.url, image: d.image, tag, clickToken: d.click_token })
          if (Buffer.byteLength(payload) > 3800) throw Object.assign(new Error('Payload too large'), { statusCode: 413 })
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, {
            vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.WEB_PUSH_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_PRIVATE_KEY! },
            TTL: ttl,
            timeout: 4000, urgency: 'normal',
          })
        }
        await pool.query(`UPDATE oweg_push_delivery SET status='accepted',accepted_at=now(),lease_token=NULL,error_code=NULL WHERE id=$1 AND lease_token=$2`, [d.id, token])
      } catch (error: unknown) {
        const code = Number((error as { statusCode?: number }).statusCode) || 0
        if (code === 404 || code === 410) await pool.query(`UPDATE oweg_push_subscription SET active=false,updated_at=now() WHERE id=$1`, [d.subscription_id])
        const retry = (code === 0 || code === 429 || code >= 500) && d.attempts < 5
        await pool.query(`UPDATE oweg_push_delivery SET status=$3,error_code=$4,next_attempt=now()+$5*interval '1 second',lease_token=NULL WHERE id=$1 AND lease_token=$2`,
          [d.id, token, retry ? 'pending' : 'failed', code ? `HTTP_${code}` : 'TRANSPORT_ERROR', retryDelay(d.attempts)])
      }
    }
    // Only two provider requests at once. The standalone worker also waits between batches.
    for (let offset = 0; offset < claimed.rows.length; offset += 2) {
      await Promise.all(claimed.rows.slice(offset, offset + 2).map(deliver))
    }
    // Exhausted leases can occur if the process crashed on its last attempt.
    await pool.query(`UPDATE oweg_push_delivery SET status='failed',error_code='ATTEMPTS_EXHAUSTED',lease_token=NULL WHERE status='sending' AND attempts>=5 AND lease_until<now()`)
    await pool.query(`UPDATE oweg_push_campaign c SET status='completed',updated_at=now() WHERE status='sending' AND prepared
      AND NOT EXISTS(SELECT 1 FROM oweg_push_delivery d WHERE d.campaign_id=c.id AND d.status IN ('pending','sending'))`)
    return { processed: claimed.rowCount }
  } finally {
    if (ownsLock) await guard.query('SELECT pg_advisory_unlock(74638292)').catch(() => undefined)
    guard.release()
  }
}
