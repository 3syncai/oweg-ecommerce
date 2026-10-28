import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const load = createRequire(import.meta.url)
const ts = load('typescript')
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { simpleProductPrices, serializeProductEditVariants } = load('../lib/product-edit.ts')
const base = { id: 'var_1', title: 'Default', sku: ' 123ABC ', inventoryCount: '0', managedInventory: true, allowBackorder: false, price: '100', discountedPrice: '', optionValues: {} }
test('single product sends editable SKU, zero stock and explicit sale removal', () => {
  const [row] = serializeProductEditVariants([base], undefined, false)
  assert.equal(row.sku, '123ABC')
  assert.equal(row.inventory_quantity, 0)
  assert.equal(row.discounted_price, null)
  assert.equal(row.price, 100)
})
test('cleared sale and MRP fields never fall back to the original values', () => {
  assert.deepEqual(simpleProductPrices({ ...base, price: '', discountedPrice: '' }, { price: '999', discountedPrice: '599' }), { price: '', discountedPrice: '' })
})
test('fallback is used only when the variant row is absent', () => {
  assert.deepEqual(simpleProductPrices(undefined, { price: '100', discountedPrice: '80' }), { price: '100', discountedPrice: '80' })
})
test('a variant sale value is serialized without losing its row ID', () => {
  const [row] = serializeProductEditVariants([{ ...base, discountedPrice: '75', optionValues: { Color: 'Red' } }], [{ title: 'Color', values: ['Red'] }], true)
  assert.equal(row.id, 'var_1')
  assert.equal(row.discounted_price, 75)
  assert.deepEqual(row.options, { Color: 'Red' })
})
for (const stock of ['-1', '1.5', 'abc']) test(`invalid stock ${stock} cannot silently become zero`, () => {
  assert.throws(() => serializeProductEditVariants([{ ...base, inventoryCount: stock }], undefined, false), /Stock/)
})
test('unchanged/unavailable stock is omitted rather than reset to zero', () => {
  assert.equal(serializeProductEditVariants([{ ...base, inventoryCount: '' }], undefined, false)[0].inventory_quantity, undefined)
})
test('edit page uses one update request and advances baselines only afterwards', () => {
  const page = fs.readFileSync(new URL('../app/products/[id]/page.tsx', import.meta.url), 'utf8')
  const submit = page.slice(page.indexOf('const handleSubmit'), page.indexOf('const handleDelete'))
  assert.equal((submit.match(/await vendorProductsApi\.update\(/g) || []).length, 1)
  assert.equal(submit.includes('vendorProductsApi.updateVariants('), false)
  assert.ok(submit.indexOf('setInitialVariantRows') > submit.indexOf('await vendorProductsApi.update('))
})
