const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, URL, ...globals, require: name => mocks[name] });
  return module.exports;
}

test('category endpoint reads current ranks without the old upstream/CDN cache', async () => {
  let calls = 0;
  const api = load('src/app/api/medusa/categories/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, init }) } },
    '@/lib/medusa': { fetchCategories: async (...args) => { assert.equal(args.length, 0); return [{ rank: ++calls }]; } },
  });
  const first = await api.GET({ url: 'http://localhost/api/medusa/categories' });
  const second = await api.GET({ url: 'http://localhost/api/medusa/categories' });
  assert.equal(first.body.categories[0].rank, 1);
  assert.equal(second.body.categories[0].rank, 2);
  assert.equal(second.init.headers['Cache-Control'], 'no-store');
});

test('returning to storefront refreshes shared categories even while the query is fresh', async () => {
  let cache;
  const api = load('src/hooks/useStoreCategories.ts', {
    '@tanstack/react-query': { useQuery: options => options },
    '@/lib/category-rank': { sortCategoriesByRank: categories => categories },
  }, { fetch: async (_url, options) => { cache = options.cache; return { ok: true, json: async () => ({ categories: [] }) }; } });
  const options = api.useStoreCategories();
  assert.equal(options.refetchOnWindowFocus, 'always');
  await options.queryFn();
  assert.equal(cache, 'no-store');
});

test('admin default category order uses rank without losing filters or pagination', async () => {
  let query;
  const api = load('my-medusa-store/src/api/admin/product-categories/route.ts', {
    '@medusajs/framework/http': { refetchEntities: async input => { query = input; return { data: [], metadata: { count: 22, skip: 20, take: 20 } }; } },
  });
  const req = { filterableFields: { parent_category_id: null }, scope: {}, queryConfig: { fields: ['id', 'name'], pagination: { skip: 20, take: 20 } } };
  let result;
  await api.GET(req, { json: body => { result = body; } });
  assert.equal(query.pagination.order.rank, 'ASC');
  assert.equal(query.pagination.skip, 20);
  assert.equal(query.idOrFilter, req.filterableFields);
  assert.equal(result.count, 22);
  req.queryConfig.pagination.order = { name: 'DESC' };
  await api.GET(req, { json() {} });
  assert.equal(query.pagination.order.name, 'DESC');
});
