const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, imports) {
  const context = { exports: {}, setTimeout, clearTimeout, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS },
  }).outputText, context)
  return context.exports
}
const stock = load('src/lib/stock-availability.ts', {})
const rowLayout = load('src/lib/home-discovery-rows.ts', {})
test('discovery buffers incomplete rows at every responsive column count', () => {
  for (const columns of [2, 3, 4, 6]) {
    const partial = rowLayout.discoveryRows(columns * 2 + 1, columns, true)
    assert.equal(partial.visibleCount, columns * 2)
    assert.equal(partial.bufferedCount, 1)
    assert.equal(partial.needsFill, true)
    const filled = rowLayout.discoveryRows(columns * 3, columns, true)
    assert.equal(filled.visibleCount, columns * 3)
    assert.equal(filled.needsFill, false)
  }
})
test('discovery retains every final product and recalculates rows on resize', () => {
  assert.equal(rowLayout.discoveryRows(17, 6, false).visibleCount, 17)
  assert.equal(rowLayout.discoveryRows(17, 4, true).visibleCount, 16)
  assert.equal(rowLayout.discoveryRows(17, 6, true).visibleCount, 12)
  assert.equal(rowLayout.discoveryRows(0, 3, true).needsFill, true)
})
test('discovery only follows a forward safe-integer cursor', () => {
  for (const cursor of [null, 24, 12, -1, 24.5, Infinity]) {
    assert.equal(rowLayout.nextDiscoveryOffset(cursor, 24), undefined)
  }
  assert.equal(rowLayout.nextDiscoveryOffset(48, 24), 48)
})
const group = load('src/lib/catalog-product-group.ts', { './stock-availability': stock })
const convert = product => {
  const variant = [...product.variants].sort((a, b) => a.price - b.price)[0]
  return { id: product.id, catalog_product_id: product.metadata?.catalog_product_id || product.id,
    name: product.title, image: '/product.jpg', price: variant.price, mrp: 100, discount: 10,
    variant_id: variant.id, inventory_quantity: variant.inventory_quantity }
}
const home = load('src/lib/home-products.ts', { './medusa': { toUiProduct: convert }, './catalog-product-group': group })
const product = (id, quantity = 5, price = 50) => ({ id: String(id), title: `Product ${id}`, variants: [
  { id: `variant-${id}`, inventory_quantity: quantity, price, allow_backorder: true, manage_inventory: true },
] })
test('home never includes zero-stock backorders, unmanaged zero-stock or unpriced products', () => {
  const unmanaged = product('unmanaged', 0); unmanaged.variants[0].manage_inventory = false
  assert.equal(home.inStockHomeProducts([product('sold', 0), unmanaged, product('free', 4, 0)]).length, 0)
})
test('home selects the stocked size rather than advertising a sold-out cheaper size', () => {
  const source = product('sized', 0, 1)
  source.variants.push({ id: 'stocked-size', inventory_quantity: 12, price: 324 })
  assert.equal(home.toInStockHomeProduct(source).variant_id, 'stocked-size')
  assert.equal(source.variants.length, 2)
})
test('seller listings collapse into one catalog card with a stocked offer', () => {
  const a = product('offer-a', 3, 60), b = product('offer-b', 8, 50)
  a.metadata = b.metadata = { catalog_product_id: 'catalog' }
  const cards = home.inStockHomeProducts([a, b])
  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, 'catalog')
  assert.equal(cards[0].price, 50)
})
function discovery(rows) {
  const calls = []
  const api = load('src/lib/home-discovery.ts', {
    './home-products': home,
    './medusa': { searchProducts: async ({ offset, limit }) => {
      calls.push(offset)
      return { products: rows.slice(offset, offset + limit), count: rows.length }
    } },
  })
  return { ...api, calls }
}
test('bounded pages advance by consumed records without skipping products', async () => {
  const api = discovery(Array.from({ length: 65 }, (_, id) => product(id)))
  const first = await api.buildHomeDiscoveryPage(0)
  const second = await api.buildHomeDiscoveryPage(first.nextOffset)
  const third = await api.buildHomeDiscoveryPage(second.nextOffset)
  assert.equal(first.products.length, 24)
  assert.equal(first.nextOffset, 24)
  assert.equal(third.nextOffset, null)
  assert.equal(new Set([...first.products, ...second.products, ...third.products].map(card => card.id)).size, 65)
})
test('sold-out batches do not cause an unbounded catalog scan', async () => {
  const api = discovery(Array.from({ length: 200 }, (_, id) => product(id, 0)))
  const page = await api.buildHomeDiscoveryPage(0)
  assert.equal(page.products.length, 0)
  assert.equal(api.calls.length, 2)
  assert.equal(page.nextOffset, 96)
})
test('concurrent requests share a cached discovery page', async () => {
  const api = discovery([product(1)])
  await Promise.all([api.getHomeDiscoveryPage(0), api.getHomeDiscoveryPage(0)])
  await api.getHomeDiscoveryPage(0)
  assert.equal(api.calls.length, 1)
})
test('flash sale checks the exact sale variant, not another stocked size', async () => {
  const api = load('src/lib/home-flash-sale.ts', { './medusa': { fetchProductsByIds: async () => [
    { variants: [{ id: 'empty', inventory_quantity: 0 }, { id: 'stocked', inventory_quantity: 5 }] },
  ] } })
  const data = await api.inStockHomeFlashSale({ active: true, products: [
    { id: 'p1', variant_id: 'empty', flash_sale_price: 20 },
    { id: 'p2', variant_id: 'stocked', flash_sale_price: 20 },
  ], flash_sale: { item_count: 2 } })
  assert.equal(data.products.length, 1)
  assert.equal(data.products[0].variant_id, 'stocked')
  assert.equal(data.flash_sale.item_count, 1)
})
test('a category containing only sold-out products is omitted, including popular picks', async () => {
  const api = load('src/lib/home-feed.ts', {
    '@/lib/medusa': { fetchCategories: async () => [{ id: 'category', name: 'Empty' }],
      fetchProductsByCategoryId: async () => ({ products: [product('sold', 0)] }) },
    './home-products': home,
  })
  const feed = await api.buildHomeFeed()
  assert.equal(feed.sections.length, 0)
  assert.equal(feed.popular, null)
})
test('eight department tiles retain existing departments and include a real leaf category', () => {
  const { selectHomeCategories } = load('src/lib/home-category-tiles.ts', {})
  const departments = Array.from({ length: 7 }, (_, index) => ({
    id: `department-${index}`, handle: `department-${index}`, rank: index,
    category_children: [{ id: `child-${index}` }],
  }))
  const selected = selectHomeCategories([...departments,
    { id: 'bags', name: 'Bags', handle: 'bags', rank: 8, category_children: [] },
    { id: 'nested', handle: 'nested', parent_category_id: 'bags', rank: 0 },
    departments[0],
  ])
  assert.equal(selected.length, 8)
  assert.equal(selected.filter(category => category.id === 'bags').length, 1)
  assert.equal(selected.some(category => category.id === 'nested'), false)
})
