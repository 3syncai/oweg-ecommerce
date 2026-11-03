// Isolated PostgreSQL fixtures. Advisory lock ownership is simulated per client.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const ts = require('typescript')
const { PGlite } = require(process.env.PGLITE_MODULE || path.join(os.tmpdir(), 'oweg-push-postgres-qa/node_modules/@electric-sql/pglite'))

function load(file, imports = {}, env = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8')
  const context = { exports: {}, Date, process: { env }, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context)
  return context.exports
}
const { refreshHomeFeedSnapshot, readHomeFeedSnapshot } = load('home-feed-snapshot.ts')

function feed(id) {
  const section = {
    key: 'kitchen', title: 'Kitchen', sourceTag: 'category:kitchen',
    products: [{ id, catalog_product_id: id, variant_id: `variant-${id}`, name: 'Fixture kettle', price: 499, inventory_quantity: 8 }],
  }
  return { sections: [section], popular: section, spotlight: null, meta: { categoriesTried: 1, categoriesWithProducts: 1, totalProducts: 1 } }
}

async function fixture(t) {
  const db = new PGlite()
  t.after(() => db.close())
  const migration = fs.readFileSync(path.join(__dirname, '../my-medusa-store/migrations/home-feed-snapshot.sql'), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  let lockOwner
  let openClients = 0
  const pool = {
    query: (query, params) => db.query(typeof query === "string" ? query : query.text, params),
    async connect() {
      const owner = Symbol('worker connection')
      openClients++
      return {
        async query(sql, args) {
          if (/pg_try_advisory_(?:xact_)?lock/i.test(sql)) {
            const locked = !lockOwner || lockOwner === owner
            if (locked) lockOwner = owner
            return { rows: [{ locked }], rowCount: 1 }
          }
          if (/pg_advisory_unlock/i.test(sql)) {
            assert.equal(lockOwner, owner)
            lockOwner = undefined
            return { rows: [], rowCount: 1 }
          }
          return db.query(sql, args)
        },
        release(error) {
          openClients--
          if (error && lockOwner === owner) lockOwner = undefined
        },
      }
    },
  }
  t.after(() => { assert.equal(openClients, 0); assert.equal(lockOwner, undefined) })
  const age = minutes => db.query("UPDATE oweg_home_feed_snapshot SET published_at = now() - $1 * interval '1 minute'", [minutes])
  return { db, pool, age }
}

test('one worker publishes while a second worker skips and readers see complete versions', async t => {
  const { pool, age } = await fixture(t)
  assert.equal(await refreshHomeFeedSnapshot(pool, async () => feed('first')), 'published')
  assert.equal(await refreshHomeFeedSnapshot(pool, async () => assert.fail('fresh snapshot should skip work')), 'skipped')
  await age(3)
  let releaseBuild
  let signalBuildStarted
  const building = new Promise(resolve => { signalBuildStarted = resolve })
  const blocked = new Promise(resolve => { releaseBuild = resolve })
  const refresh = refreshHomeFeedSnapshot(pool, async () => {
    signalBuildStarted()
    await blocked
    return feed('second')
  })
  try {
    await Promise.race([building, refresh.then(() => assert.fail('expected a refresh to start'))])
    assert.equal(await refreshHomeFeedSnapshot(pool, async () => assert.fail('only lock owner may build')), 'skipped')
    const results = await Promise.all(Array.from({ length: 100 }, () => readHomeFeedSnapshot(pool)))
    assert(results.every(result => result.feed.sections[0].products[0].id === 'first'))
  } finally {
    releaseBuild()
    await refresh
  }
  assert.equal(await refresh, 'published')
  assert.equal((await readHomeFeedSnapshot(pool)).feed.sections[0].products[0].id, 'second')
})

test('failed and empty refreshes preserve the last good feed and permit recovery', async t => {
  const { pool, age } = await fixture(t)
  await refreshHomeFeedSnapshot(pool, async () => feed('last-good'))
  await age(3)
  await assert.rejects(refreshHomeFeedSnapshot(pool, async () => { throw new Error('category timed out') }), /category timed out/)
  assert.equal((await readHomeFeedSnapshot(pool)).feed.sections[0].products[0].id, 'last-good')
  await assert.rejects(refreshHomeFeedSnapshot(pool, async () => ({
    sections: [], popular: null, spotlight: null,
    meta: { categoriesTried: 1, categoriesWithProducts: 0, totalProducts: 0 },
  })))
  assert.equal((await readHomeFeedSnapshot(pool)).feed.sections[0].products[0].id, 'last-good')
  assert.equal(await refreshHomeFeedSnapshot(pool, async () => feed('recovered')), 'published')
  assert.equal((await readHomeFeedSnapshot(pool)).feed.sections[0].products[0].id, 'recovered')
})

test('missing, malformed and over-age snapshots are rejected', async t => {
  const { db, pool, age } = await fixture(t)
  await assert.rejects(readHomeFeedSnapshot(pool))
  await refreshHomeFeedSnapshot(pool, async () => feed('expired'))
  await age(31)
  await assert.rejects(readHomeFeedSnapshot(pool))
  await db.exec("UPDATE oweg_home_feed_snapshot SET payload = '{}'::jsonb, published_at = now()")
  await assert.rejects(readHomeFeedSnapshot(pool))
})

test('100 concurrent homepage reads coalesce and skip catalogue work in snapshot mode', async t => {
  const { pool, age } = await fixture(t)
  let snapshotReads = 0
  const { buildHomeFeedCached } = load('home-feed-cache.ts', {
    'next/cache': { unstable_cache: fn => fn },
    './home-feed': { buildHomeFeed: () => assert.fail('request triggered a catalogue rebuild') },
    './bounded-pool': { getBoundedPool: () => pool },
    './home-feed-snapshot': { readHomeFeedSnapshot: async input => {
      snapshotReads++
      return readHomeFeedSnapshot(input)
    } },
  }, { HOME_FEED_SNAPSHOT_ENABLED: 'true', DATABASE_URL: 'fixture' })
  const unavailable = await Promise.allSettled(Array.from({ length: 100 }, () => buildHomeFeedCached()))
  assert(unavailable.every(result => result.status === 'rejected'))
  assert.equal(snapshotReads, 1)

  await refreshHomeFeedSnapshot(pool, async () => feed('available'))
  await age(29.8)
  const available = await Promise.all(Array.from({ length: 100 }, () => buildHomeFeedCached()))
  assert(available.every(result => result.feed.sections[0].products[0].id === 'available'))
  assert(available[0].expiresAt - Date.now() <= 12_000)
  assert.equal(snapshotReads, 2)
  assert.equal((await buildHomeFeedCached()).cacheHit, true)
  assert.equal(snapshotReads, 2)
})
