const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { PGlite } = require(process.env.PGLITE_MODULE || path.join(os.tmpdir(), 'oweg-push-postgres-qa/node_modules/@electric-sql/pglite'))

require('../my-medusa-store/node_modules/ts-node').register({
  project: path.join(__dirname, '../my-medusa-store/tsconfig.json'),
  transpileOnly: true,
})
const { enqueueOrderEmail, processOrderEmails } = require('../my-medusa-store/src/services/order-email/outbox.ts')
const { renderOrderEmail, storefrontOrigin } = require('../my-medusa-store/src/services/order-email/template.ts')
const orderEmail = require('../my-medusa-store/src/subscribers/order-email.ts')

const schema = fs.readFileSync(path.join(__dirname, '../my-medusa-store/migrations/order-email-outbox.sql'), 'utf8')
const recipient = 'buyer@example.test'
const origin = 'https://store.example.test'
const logger = { warn: () => {} }

async function fixture(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE TABLE "order" (id text PRIMARY KEY, email text, display_id integer,
      status text DEFAULT 'pending', is_draft_order boolean DEFAULT false,
      no_notification boolean, metadata jsonb, deleted_at timestamptz);
    CREATE TABLE order_fulfillment (order_id text, fulfillment_id text, deleted_at timestamptz);
    CREATE TABLE fulfillment (id text PRIMARY KEY, shipped_at timestamptz, delivered_at timestamptz,
      canceled_at timestamptz, deleted_at timestamptz);
  `)
  await db.exec(schema)
  await db.exec(schema)
  const env = { ORDER_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'test-only', RESEND_FROM: 'OWEG <orders@example.test>', ORDER_EMAIL_STOREFRONT_URL: origin }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  return {
    db,
    database: { query: async (sql, params) => {
      const result = await db.query(sql, params)
      return { ...result, rowCount: result.affectedRows }
    } },
    insert: (id, email = recipient) => db.query('INSERT INTO "order" (id, email, display_id) VALUES ($1, $2, 123)', [id, email]),
  }
}

test('all four templates use only the configured HTTPS origin and accessible text links', () => {
  for (const event of ['order_placed', 'order_shipped', 'order_delivered', 'order_cancelled']) {
    const content = renderOrderEmail({ event, origin, orderId: 'order_fixture', displayId: 123 })
    const tracking = ['order_shipped', 'order_delivered'].includes(event) ? '/track' : ''
    assert.match(content.subject, /OWEG order #123/)
    assert.ok(content.html.includes(`href="${origin}/account/orders/order_fixture${tracking}?orderNo=123"`))
    assert.ok(content.text.includes(`${origin}/account/orders/order_fixture${tracking}?orderNo=123`))
    assert.ok(content.html.includes(`href="${origin}/contact"`))
  }
  assert.match(renderOrderEmail({ event: 'order_placed', origin, orderId: '<script>', displayId: null }).html, /&lt;script&gt;/)
  const cancellation = renderOrderEmail({
    event: 'order_cancelled', origin, orderId: 'order_fixture', displayId: 123,
    cancellationReason: 'Stock & availability <check>',
  })
  assert.match(cancellation.html, /Stock &amp; availability &lt;check&gt;/)
  assert.match(cancellation.text, /Stock & availability <check>/)
  for (const bad of ['http://example.test', 'https://user@example.test', 'https://example.test/store']) {
    assert.throws(() => storefrontOrigin(bad))
  }
  assert.equal(orderEmail.config.event.length, 4)
})

test('dedupes native and tracking signals and rejects draft, suppressed, unfinished and wrong-state events', async t => {
  const { db, database, insert } = await fixture(t)
  await insert('order_checkout')
  await insert('order_cancel')
  await insert('order_draft')
  await insert('order_suppressed')
  await insert('order_no_notification')
  await db.exec(`
    UPDATE "order" SET status='canceled',
      metadata='{"cancellation_source":"admin","customer_cancel_reason":"Out of stock","vendor_cancel_message":"Internal only"}'
      WHERE id='order_cancel';
    UPDATE "order" SET is_draft_order=true WHERE id='order_draft';
    UPDATE "order" SET metadata='{"checkout_duplicate_suppressed":true}' WHERE id='order_suppressed';
    UPDATE "order" SET no_notification=true WHERE id='order_no_notification';
    INSERT INTO fulfillment VALUES ('ful_1', now(), NULL, NULL, NULL);
    INSERT INTO order_fulfillment VALUES ('order_checkout', 'ful_1', NULL);
  `)
  for (const orderId of ['order_checkout', 'order_checkout', 'order_draft', 'order_suppressed', 'order_no_notification']) {
    await enqueueOrderEmail({ orderId }, 'order_placed', database)
  }
  await enqueueOrderEmail({ orderId: 'order_checkout' }, 'order_cancelled', database)
  await enqueueOrderEmail({ orderId: 'order_cancel' }, 'order_cancelled', database)
  await enqueueOrderEmail({ fulfillmentId: 'ful_1' }, 'order_shipped', database)
  await enqueueOrderEmail({ orderId: 'order_checkout' }, 'order_shipped', database)
  await enqueueOrderEmail({ fulfillmentId: 'ful_1' }, 'order_delivered', database)
  assert.equal((await db.query('SELECT id FROM oweg_order_email_outbox')).rows.length, 3)
  await db.exec("UPDATE fulfillment SET delivered_at = now() WHERE id='ful_1'")
  await enqueueOrderEmail({ fulfillmentId: 'ful_1' }, 'order_delivered', database)

  const sent = []
  const request = async (_url, init) => {
    sent.push({ key: init.headers['Idempotency-Key'], body: JSON.parse(init.body) })
    return Response.json({ id: 'provider-fixture' })
  }
  await Promise.all([processOrderEmails(database, request, logger), processOrderEmails(database, request, logger)])
  assert.equal(sent.length, 4)
  assert.equal(new Set(sent.map(item => item.key)).size, 4)
  assert.ok(sent.every(item => item.body.to[0] === recipient && item.body.html.includes(origin)))
  const cancelled = sent.find(item => item.body.subject.startsWith('Order cancelled'))
  assert.match(cancelled.body.html, /Out of stock/)
  assert.doesNotMatch(cancelled.body.html, /Internal only/)
  const { rows } = await db.query('SELECT status, provider_id FROM oweg_order_email_outbox')
  assert.ok(rows.every(row => row.status === 'accepted' && row.provider_id === 'provider-fixture'))
})

test('retries an ambiguous send with the same body and key, then stops on changed recipient', async t => {
  const { db, database, insert } = await fixture(t)
  await insert('order_retry')
  await enqueueOrderEmail({ orderId: 'order_retry' }, 'order_placed', database)
  const received = []
  const request = async (_url, init) => {
    received.push([init.headers['Idempotency-Key'], init.body])
    throw new Error('connection closed')
  }
  await processOrderEmails(database, request, logger)
  await processOrderEmails(database, request, logger)
  assert.equal(received.length, 1)
  await db.exec('UPDATE oweg_order_email_outbox SET available_at = now()')
  await processOrderEmails(database, request, logger)
  assert.deepEqual(received[0], received[1])
  await db.exec(`UPDATE "order" SET email='other@example.test';
    UPDATE oweg_order_email_outbox SET available_at = now()`)
  await processOrderEmails(database, request, logger)
  assert.equal(received.length, 2)
  const { rows: [row] } = await db.query('SELECT status, last_error FROM oweg_order_email_outbox')
  assert.deepEqual(row, { status: 'failed', last_error: 'request_changed_after_attempt' })
})

test('expires old attempts and skips a missing recipient without sending', async t => {
  const { db, database, insert } = await fixture(t)
  await insert('order_old')
  await insert('order_no_email', null)
  await enqueueOrderEmail({ orderId: 'order_old' }, 'order_placed', database)
  await enqueueOrderEmail({ orderId: 'order_no_email' }, 'order_placed', database)
  await db.exec("UPDATE oweg_order_email_outbox SET first_attempt_at=now()-interval '21 hours' WHERE order_id='order_old'")
  await processOrderEmails(database, async () => assert.fail('provider must not be called'), logger)
  const { rows } = await db.query('SELECT status, last_error FROM oweg_order_email_outbox ORDER BY order_id')
  assert.deepEqual(rows, [
    { status: 'skipped', last_error: 'recipient_unavailable' },
    { status: 'failed', last_error: 'retry_window_elapsed' },
  ])
})
