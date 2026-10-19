import { createRequire } from "node:module"
import { test } from "node:test"
import assert from "node:assert/strict"
const load = createRequire(import.meta.url)
const fs = load('node:fs'), ts = load('typescript')
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { getCalculatorProductPrice, calculateVendorPricing } = load('../lib/productPriceCalculator.ts')
for (const [mrp, sale, expected] of [
  ['2050', '', '2050'], ['2050', '1845', '1845'], [2150, null, '2150'], ['100', '0', '0'],
  ['100', '100', '100'], ['', '', ''], [undefined, undefined, ''], ['100', 'invalid', '100'],
  ['100', '-10', '100'], ['100', '101', '100'], ['bad', '', ''], ['100.50', '80.25', '80.25'],
]) test(`calculator source MRP=${mrp}, sale=${sale}`, () => assert.equal(getCalculatorProductPrice(mrp, sale), expected))
test('fee calculation receives the selected selling price rather than MRP', () => {
  const price = getCalculatorProductPrice('2050', '1845')
  assert.equal(calculateVendorPricing(Number(price), 0, 18).item.total, 1845)
})
