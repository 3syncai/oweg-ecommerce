import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const load = createRequire(import.meta.url)
const ts = load('typescript')
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename)
const { resolveProductOptionsFromRows, serializeVariantOptions, createVariantRowFromOptions, UNSPECIFIED_SIZE } = load('../lib/variant-matrix.ts')
const { normalizeOptionsAndVariants } = load('../../my-medusa-store/src/lib/vendor-product-options.ts')
const definitions = [{ title: 'Color', values: ['Red', 'Blue'] }, { title: 'Size', values: ['Old size'], valuesInput: 'Old size' }]
function prepare(values) {
  const rows = values.map(createVariantRowFromOptions)
  const options = resolveProductOptionsFromRows(definitions, rows)
  const variants = rows.map(row => ({ title: row.title, options: serializeVariantOptions(options, row.optionValues) }))
  return { options, variants, normalized: normalizeOptionsAndVariants(options, variants) }
}
test('blank sizes are omitted and accepted by product creation', () => {
  const result = prepare([{ Color: 'Red', Size: '' }, { Color: 'Blue', Size: ' ' }])
  assert.deepEqual(result.options.map(option => option.title), ['Color'])
  assert.deepEqual(result.variants.map(variant => variant.options), [{ Color: 'Red' }, { Color: 'Blue' }])
  assert.equal(result.normalized.error, undefined)
})
test('blank size can coexist with numeric, alphabetic, and mixed sizes', () => {
  const result = prepare(['', '32', 'M', '2XL'].map(Size => ({ Color: 'Red', Size })))
  assert.deepEqual(result.options.find(option => option.title === 'Size').values, ['32', 'M', '2XL', UNSPECIFIED_SIZE])
  assert.deepEqual(result.variants.map(variant => variant.options.Size), [UNSPECIFIED_SIZE, '32', 'M', '2XL'])
  assert.equal(result.normalized.error, undefined)
})
test('clearing all sizes removes stale configured size values', () => {
  const result = prepare([{ Color: 'Red', Size: '' }])
  assert.equal(result.options.some(option => option.title === 'Size'), false)
  assert.equal(result.normalized.error, undefined)
})
test('duplicate blank-size rows remain invalid', () => {
  const result = prepare([{ Color: 'Red', Size: '' }, { Color: 'Red', Size: '' }])
  assert.match(result.normalized.error, /Duplicate variant option combination/)
})
