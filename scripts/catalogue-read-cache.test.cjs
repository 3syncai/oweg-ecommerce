const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/lib/catalogue-read-cache.ts'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText

function setup(readCategory) {
  const entries = new Map()
  const calls = []
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Buffer,
    require(name) {
      if (name === './medusa') return {
        fetchCatalogCategoryProducts(id, options) {
          calls.push({ id, ...options })
          return readCategory(options)
        },
      }
      if (name === 'next/cache') return {
        unstable_cache: callback => async (...args) => {
          const key = JSON.stringify(args)
          if (!entries.has(key)) {
            const value = await callback(...args)
            const entry = JSON.stringify({ data: { body: JSON.stringify(value) } })
            assert.ok(Buffer.byteLength(entry) < 2 * 1024 * 1024)
            entries.set(key, value)
          }
          return entries.get(key)
        },
      }
      return require(name)
    },
  })
  return { read: exports.fetchCatalogCategoryProducts, entries, calls }
}

const options = { includeSubcategories: true, offset: 0, fallbackLimit: 20 }

test('large categories retain full product and seller data across a shared cache hit', async () => {
  const products = Array.from({ length: 441 }, (_, index) => ({
    id: `prod_${index}`,
    description: 'An appliance with detailed specifications. '.repeat(220),
    metadata: { catalog_product_id: `catalog_${index % 400}` },
    variants: [{ id: `variant_${index}`, inventory_quantity: index }],
  }))
  const snapshot = { products, count: products.length, complete: true }
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) > 3 * 1024 * 1024)
  const { read, calls, entries } = setup(() => snapshot)

  const results = await Promise.all([read('home', options), read('home', options)])
  assert.equal(calls.length, 1)
  assert.equal(results[0], snapshot)
  assert.equal(results[1], snapshot)
  assert.equal(typeof entries.get('["home",true]'), 'string')

  const nextPage = await read('home', { ...options, offset: 20 })
  assert.equal(JSON.stringify(nextPage), JSON.stringify(snapshot))
  assert.equal(calls.length, 1)
})

test('an oversized compressed snapshot still returns products without an oversized cache write', async () => {
  const snapshot = {
    products: [{ id: 'large', metadata: { source: randomBytes(1200 * 1024).toString('base64') } }],
    count: 1,
    complete: true,
  }
  const { read, calls, entries } = setup(() => snapshot)
  assert.equal(await read('large', options), snapshot)
  assert.equal(calls.length, 1)
  assert.equal(entries.get('["large",true]'), null)
  assert.equal(await read('large', options), snapshot)
  assert.equal(calls.length, 2)
})

test('an incomplete snapshot preserves first-page slicing and the existing offset fallback', async () => {
  const products = Array.from({ length: 60 }, (_, index) => ({ id: String(index) }))
  const { read, calls } = setup(({ offset }) => ({
    products: offset ? [{ id: String(offset) }] : products,
    count: 700,
    complete: false,
  }))
  assert.equal((await read('large', options)).products.length, 20)
  const next = await read('large', { ...options, offset: 20 })
  assert.equal(next.products[0].id, '20')
  assert.equal(calls[1].fallbackLimit, 20)
  assert.equal(calls[1].offset, 20)
})
