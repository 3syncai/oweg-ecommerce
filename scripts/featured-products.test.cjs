const { test } = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { runInNewContext } = require("node:vm")
const ts = require("typescript")

function load(file, imports = {}, clock = Date) {
  const source = readFileSync(join(__dirname, "..", file), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  runInNewContext(outputText, {
    exports,
    Date: clock,
    console: { warn() {} },
    require(name) {
      assert.ok(name in imports, `Unexpected import ${name}`)
      return imports[name]
    },
  }, { filename: file })
  return exports
}

const shared = load("my-medusa-store/src/shared/featured-products.ts")
const config = { title: "Kitchen favourites", product_ids: ["prod_B", "prod_A", "prod_hidden", "prod_sold"] }

test("featured selection trims the title and accepts larger selections and rejects malformed or duplicate IDs", () => {
  const parse = shared.parseFeaturedProducts
  assert.equal(parse({ ...config, title: "  Kitchen favourites " }).title, config.title)
  assert.equal(parse({ ...config, title: " " }), null)
  assert.equal(parse({ ...config, product_ids: ["prod_A", "prod_A"] }), null)
  assert.equal(parse({ ...config, product_ids: ["../admin"] }), null)
  assert.equal(parse({ ...config, product_ids: Array.from({ length: 73 }, (_, i) => `prod_${i}`) }).product_ids.length, 73)
  assert.ok(parse({ ...config, product_ids: [] }))
})

test("publish validates catalog selections, rejects stale revisions and supports clearing the row", async () => {
  let saved = null
  const revision = "00000000-0000-4000-8000-000000000001"
  const { POST } = load("my-medusa-store/src/api/admin/featured-products/route.ts", {
    "@medusajs/framework/utils": { Modules: { PRODUCT: "product" } },
    "../../../lib/featured-products": {
      async publishFeaturedProducts(_request, next, expected) {
        if (expected !== (saved ? revision : null)) return null
        saved = next
        return revision
      },
    },
    "../../../lib/simple-rate-limit": { checkRateLimit: () => ({ allowed: true }) },
    "../../../shared/featured-products": shared,
  })
  const call = (product_ids, expected) => POST({
    body: { config: { ...config, product_ids }, revision: expected },
    auth_context: { actor_id: "user_1" },
    scope: { resolve: () => ({ listProducts: async filter => filter.id.filter(id => id !== "prod_hidden").map(id => ({ id })) }) },
  }, {
    code: 200,
    status(code) { this.code = code; return this },
    json(body) { return { code: this.code, body } },
  })

  assert.equal((await call(["prod_hidden"], null)).code, 400)
  assert.equal(saved, null)
  assert.equal((await call(["prod_B", "prod_A"], null)).code, 200)
  assert.deepEqual(saved.product_ids, ["prod_B", "prod_A"])
  assert.equal((await call(["prod_A"], null)).code, 409)
  assert.deepEqual(saved.product_ids, ["prod_B", "prod_A"])
  const larger = Array.from({ length: 73 }, (_, i) => `prod_${i}`)
  assert.equal((await call(larger, revision)).code, 200)
  assert.deepEqual(saved.product_ids, larger)
  assert.equal((await call([], revision)).code, 200)
  assert.equal(saved.product_ids.length, 0)
})

test("homepage coalesces concurrent requests and keeps editor order and catalog prices", async () => {
  let configReads = 0
  let catalogReads = 0
  let now = 100_000
  let currentConfig = config
  class Clock extends Date { static now() { return now } }
  const { loadFeaturedProducts } = load("src/lib/featured-products-server.ts", {
    "next/cache": {
      unstable_cache(fn, _key, options) {
        assert.equal(options.revalidate, 30)
        let cached
        let expiresAt = 0
        return async () => {
          if (now >= expiresAt) {
            cached = await fn()
            expiresAt = now + options.revalidate * 1000
          }
          return cached
        }
      },
    },
    "./medusa": {
      fetchFeaturedProductsConfig: async () => { configReads++; return { ...currentConfig, nextCursor: null } },
      fetchProductsByIds: async ids => {
        catalogReads++
        assert.deepEqual(ids, config.product_ids)
        return [
          { id: "prod_A", price: 749, variants: [{}] },
          { id: "prod_B", price: 849, variants: [{}, {}] },
          { id: "prod_sold", price: 899, variants: [] },
        ]
      },
    },
    "./home-products": {
      homeProductKey: item => item.id,
      toInStockHomeProduct: product => product.variants.length ? { id: product.id, price: product.price } : null,
    },
  }, Clock)

  const copies = await Promise.all(Array.from({ length: 50 }, () => loadFeaturedProducts()))
  const row = copies[0]
  assert.ok(copies.every(copy => copy === row))
  assert.equal(row.title, config.title)
  assert.deepEqual(Array.from(row.products, p => [p.id, p.price]), [["prod_B", 849], ["prod_A", 749]])
  assert.equal(row.products[0].variant_count, 2)

  currentConfig = { ...config, product_ids: [] }
  assert.equal(await loadFeaturedProducts(), row)
  now += 30_000
  assert.equal(await loadFeaturedProducts(), null)
  assert.equal(configReads, 2)
  assert.equal(catalogReads, 1)
})

test("storefront returns bounded pages in admin order and rejects stale cursors", async () => {
  const ids = Array.from({ length: 35 }, (_, index) => `prod_${index}`)
  const revision = "00000000-0000-4000-8000-000000000001"
  let savedRevision = revision
  const { GET } = load("my-medusa-store/src/api/store/featured-products/route.ts", {
    "../../../lib/featured-products": { readFeaturedProducts: async () => ({ config: { ...config, product_ids: ids }, revision: savedRevision }) },
    "../../../shared/featured-products": shared,
  })
  const call = cursor => GET({ query: cursor === undefined ? {} : { cursor } }, {
    code: 200,
    status(code) { this.code = code; return this },
    set() { return this },
    json(body) { return { code: this.code, body } },
  })
  const first = await call()
  assert.equal(first.code, 200)
  assert.equal(first.body.product_ids.length, 16)
  const second = await call(first.body.next_cursor)
  const last = await call(second.body.next_cursor)
  assert.deepEqual([...first.body.product_ids, ...second.body.product_ids, ...last.body.product_ids], ids)
  assert.equal(last.body.next_cursor, null)
  assert.equal((await call("bad")).code, 400)
  savedRevision = "00000000-0000-4000-8000-000000000002"
  assert.equal((await call(first.body.next_cursor)).code, 409)
})
