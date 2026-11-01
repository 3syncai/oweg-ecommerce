const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireFn = () => ({})) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText, { module, exports: module.exports, require: requireFn, console });
  return module.exports;
}
const { vendorProductSelection } = load('my-medusa-store/src/lib/vendor-product-list.ts');
const pagination = load('my-medusa-store/src/lib/vendor-pagination.ts');

test('route hydrates only selected IDs, preserves order/SKUs and skips empty pages', async () => {
  let graphCalls = 0;
  let selected = ['p2', 'p1', 'reassigned'];
  const counts = { total: 1001, published: 2, draft: 36, pending: 963 };
  const route = load('my-medusa-store/src/api/vendor/products/route.ts', name => {
    if (name.endsWith('vendor-product-list')) return { vendorProductSelection: async () => ({ ids: selected, count: 1001, counts }) };
    if (name.endsWith('vendor-pagination')) return pagination;
    if (name.endsWith('db-pool')) return { getSharedDbPool: () => ({}) };
    if (name.endsWith('/guards')) return { requireApprovedVendor: async req => req.allowed ? { vendor_id: 'v1' } : null };
    if (name.endsWith('catalog-identity')) return { publicVariantSku: (_, v) => v.sku.replace('internal_', '') };
    return {};
  });
  const graph = async options => {
    graphCalls++;
    assert.deepEqual(Array.from(options.filters.id), selected);
    assert.equal(options.pagination.take, selected.length);
    return { data: ['p1', 'reassigned', 'p2'].map(id => ({ id, metadata: { vendor_id: id === 'reassigned' ? 'v2' : 'v1' }, variants: [{ sku: 'internal_public' }] })) };
  };
  let body;
  const res = { setHeader() {}, json(value) { body = value; } };
  const req = { allowed: true, query: { limit: '20', offset: '20' }, scope: { resolve: () => ({ graph }) } };
  await route.GET(req, res);
  assert.deepEqual(Array.from(body.products, p => p.id), ['p2', 'p1']);
  assert.equal(body.products[0].variants[0].sku, 'public');
  assert.equal(body.count, 1001); assert.equal(body.offset, 20); assert.equal(body.counts.pending, 963);
  selected = [];
  await route.GET(req, res);
  assert.equal(body.products.length, 0); assert.equal(body.count, 1001); assert.equal(graphCalls, 1);
  await route.GET({ ...req, allowed: false }, res);
  assert.equal(graphCalls, 1);
});

test('legacy all response hydrates a 1001-product catalog in bounded batches', async () => {
  const ids = Array.from({ length: 1001 }, (_, i) => `p${i}`);
  const batches = [];
  const route = load('my-medusa-store/src/api/vendor/products/route.ts', name => {
    if (name.endsWith('vendor-product-list')) return { vendorProductSelection: async () => ({ ids, count: 1001, counts: { total: 1001 } }) };
    if (name.endsWith('vendor-pagination')) return pagination;
    if (name.endsWith('db-pool')) return { getSharedDbPool: () => ({}) };
    if (name.endsWith('/guards')) return { requireApprovedVendor: async () => ({ vendor_id: 'v1' }) };
    return {};
  });
  let body;
  await route.GET({ query: {}, scope: { resolve: () => ({ graph: async options => {
    batches.push(options.filters.id.length);
    return { data: Array.from(options.filters.id).reverse().map(id => ({ id, metadata: { vendor_id: 'v1' } })) };
  } }) } }, { setHeader() {}, json(value) { body = value; } });
  assert.equal(batches.length, 11); assert.equal(Math.max(...batches), 100);
  assert.deepEqual(Array.from(body.products, p => p.id), ids);
  assert.equal(body.limit, 1001); assert.equal(body.offset, 0);
});

const url = process.env.VENDOR_LIST_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/postgres') {
    throw new Error('Only disposable localhost:55439/postgres is permitted');
  }
}
test('Postgres: 1001-product catalog retains tenant, status, search, counts and legacy all semantics', { skip: !url }, async () => {
  const { Client } = require('../my-medusa-store/node_modules/pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE product(id text, title text, handle text, subtitle text,
      status text, metadata jsonb, updated_at timestamptz, created_at timestamptz, deleted_at timestamptz)`);
    await db.query(`INSERT INTO product SELECT 'p' || lpad(i::text, 4, '0'),
      CASE WHEN i = 5 THEN 'Literal %_\\ marker' ELSE 'Item ' || i END,
      'handle-' || i, 'subtitle', CASE WHEN i % 2 = 0 THEN 'published' ELSE 'draft' END,
      jsonb_build_object('vendor_id', 'v1', 'approval_status', CASE WHEN i < 963 THEN 'pending' ELSE 'approved' END),
      CASE WHEN i = 1000 THEN NULL ELSE '2026-01-01'::timestamptz + i * interval '1 minute' END,
      '2026-01-01'::timestamptz + i * interval '1 minute', NULL FROM generate_series(0,1000) i`);
    await db.query(`INSERT INTO product VALUES
      ('foreign', 'Item', '', '', 'published', '{"vendor_id":"v2"}', now(), now(), NULL),
      ('deleted', 'Item', '', '', 'published', '{"vendor_id":"v1"}', now(), now(), now())`);
    const read = (q = '', status = '', offset = 0, all = false) => vendorProductSelection(db, 'v1', { limit: 20, offset, all }, q, status);
    const first = await read();
    assert.equal(first.count, 1001); assert.equal(first.counts.total, 1001); assert.equal(first.counts.pending, 963);
    assert.equal(first.counts.published, 19); assert.equal(first.counts.draft, 19);
    assert.equal(first.ids.length, 20); assert.equal(first.ids[0], 'p1000');
    const second = await read('', '', 20);
    assert.equal(second.ids.some(id => first.ids.includes(id)), false);
    assert.equal((await read('', 'published')).count, 19);
    assert.equal((await read('', 'pending')).count, 963);
    assert.equal((await read('', 'draft')).count, 19);
    assert.equal((await read('', 'invalid')).count, 0);
    const literal = await read('%_\\');
    assert.deepEqual(Array.from(literal.ids), ['p0005']); assert.equal(literal.counts.total, 1001);
    assert.equal((await read('handle-5')).count, 111);
    assert.equal((await read("' OR 1=1 --")).count, 0);
    assert.equal((await read('', '', 2000)).ids.length, 0);
    const legacy = await read('', '', 0, true);
    assert.equal(legacy.ids.length, 1001); assert.equal(new Set(legacy.ids).size, 1001);
    assert.equal(legacy.ids.includes('foreign'), false); assert.equal(legacy.ids.includes('deleted'), false);
  } finally {
    await db.query('ROLLBACK'); await db.end();
  }
});
