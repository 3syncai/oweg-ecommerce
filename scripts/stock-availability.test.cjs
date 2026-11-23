const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, imports = {}) {
  const sandbox = { exports: {}, process: { env: {} }, URLSearchParams, console, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import: ${name}`)
  } }
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText, sandbox)
  return sandbox.exports
}

const availability = load('src/lib/stock-availability.ts')
test('managed zero stock stays unavailable even when backorders are enabled', () => {
  assert.equal(availability.isVariantPurchasable({ manage_inventory: true, allow_backorder: true, inventory_quantity: 0 }), false)
  assert.equal(availability.isVariantPurchasable({ allow_backorder: true }), false)
  assert.equal(availability.isVariantPurchasable({ inventory_quantity: -2 }), false)
})
test('positive stock and intentionally unmanaged inventory keep their existing behavior', () => {
  assert.equal(availability.isVariantPurchasable({ manage_inventory: true, inventory_quantity: 12 }), true)
  assert.equal(availability.isVariantPurchasable({ manage_inventory: false, inventory_quantity: 0 }), true)
})
test('catalog merge selects a stocked seller rather than a cheaper backorder', () => {
  const { mergeCatalogProductDetails } = load('src/lib/catalog-product-group.ts', { './stock-availability': availability })
  const product = (id, quantity, price) => ({ id, options: [{ title: 'Size', values: ['42C'] }], variants: [
    { id: `${id}-variant`, options: { Size: '42C' }, price, mrp: 364, discount: 0, manage_inventory: true, allow_backorder: true, inventory_quantity: quantity },
  ] })
  const result = mergeCatalogProductDetails([product('original', 0, 300), product('stocked', 12, 324)], 'original')
  assert.equal(result.variants[0].id, 'stocked-variant')
  assert.equal(result.variant_id, 'stocked-variant')
})

function cartRoute({ offers = [], status = 200, existing = 0, deals = [] } = {}) {
  const writes = []
  const axios = async request => {
    if (request.method !== 'get') { writes.push(request); return { status: 200, data: { cart: { id: 'cart-test' } } } }
    if (request.url.includes('/catalog-offers')) return { status, data: { offers:offers.map(offer=>({...offer,flash_sale:deals.find(d=>d.variant_id===offer.variant_id)})) } }
    if (request.url.includes('/flash-sale')) return { status: 200, data: { active: !!deals.length, products: deals } }
    return { status: 200, data: { cart: { id: 'cart-test', items: [{ variant_id: 'variant-test', quantity: existing }] } } }
  }
  const route = load('src/app/api/medusa/cart/line-items/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, cookies: { set() {} } }) } },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'cart-test' }) }) },
    axios,
    '@/lib/cart-flash-prices': { cartFlashSale: async () => ({active:false}), priceCartPayload: async data => data },
    '@/lib/cart-cookie': { CART_COOKIE:'cart_id', cartCookieOptions:()=>({}) },
  })
  return { writes, post: (quantity = 1, pinned = true, expected_flash_price) => route.POST({
    json: async () => ({ variant_id: 'variant-test', quantity, seller_selected: pinned, expected_flash_price }), headers: { get: () => null },
  }) }
}
test('empty seller offers reject pinned and automatic add-to-cart without writing a cart', async () => {
  for (const pinned of [true, false]) {
    const api = cartRoute()
    assert.equal((await api.post(1, pinned)).status, 409)
    assert.equal(api.writes.length, 0)
  }
})
test('stock lookup failures cannot fall through into a backorder purchase', async () => {
  const api = cartRoute({ status: 503 })
  assert.equal((await api.post()).status, 503)
  assert.equal(api.writes.length, 0)
})
test('cart quantities cannot exceed the selected seller stock', async () => {
  const api = cartRoute({ offers: [{ variant_id: 'variant-test', available: 2, price: 324 }], existing: 2 })
  assert.equal((await api.post()).status, 409)
  assert.equal(api.writes.length, 0)
})
test('a stocked offer can still be added to the cart', async () => {
  const api = cartRoute({ offers: [{ variant_id: 'variant-test', available: 12, price: 324 }] })
  assert.equal((await api.post()).status, 200)
  assert.equal(api.writes.length, 1)
})

test('expired or repriced advertised offers never write a cart or substitute another seller', async () => {
  for (const deals of [[], [{variant_id:'other',flash_sale_price:729}], [{variant_id:'variant-test',flash_sale_price:750}]]) {
    const api = cartRoute({ offers:[{variant_id:'variant-test',available:2,price:851}], deals })
    assert.equal((await api.post(1,true,729)).status,409)
    assert.equal(api.writes.length,0)
  }
  const api = cartRoute({offers:[{variant_id:'variant-test',available:2,price:851}],deals:[{variant_id:'variant-test',flash_sale_price:729}]})
  assert.equal((await api.post(1,true,729)).status,200)
  assert.equal(api.writes[0].data.metadata.seller_selected,true)
})

test('seller refresh distinguishes sold-out tracked listings from a missing seller listing', async () => {
  let candidates = [];
  const route = load('my-medusa-store/src/api/store/catalog-offers/route.ts', {
    '../../../lib/vendor-offer-routing': { listSameSkuOffers: async () => candidates, publicSellerOffers: () => [] },
    '../../../lib/flash-offer-delivery': {}, '../../../modules/flash-sale': {}, '../../../lib/flash-sale-eligibility': {},
  });
  const request = { query: { variant_id: 'qa', deals: '1' } };
  const response = {json: value => value};
  assert.equal((await route.GET(request, response)).sold_out, false);
  candidates = [{ available: 0 }];
  assert.equal((await route.GET(request, response)).sold_out, true);
});
