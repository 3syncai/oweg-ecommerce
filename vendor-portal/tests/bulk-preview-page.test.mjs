import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load("node:test"), assert = load("node:assert/strict")
const fs = load("node:fs"), ts = load("typescript")
load.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { bulkPreviewPage } = load("../lib/bulk-preview-page.ts")

test("999 rows can be visited once without skips or duplicates, including the final partial page", () => {
  const rows = Array.from({ length: 999 }, (_, index) => ({ sku: `sku-${index}` }))
  const seen = []
  for (let page = 1; page <= 20; page++) {
    const window = bulkPreviewPage(rows.length, page)
    const visible = rows.slice(window.start, window.end)
    assert.ok(visible.length <= 50)
    seen.push(...visible)
  }
  assert.deepEqual(seen, rows)
  assert.deepEqual(bulkPreviewPage(999, 20), { page: 20, pageCount: 20, start: 950, end: 999 })
})

test("editing a later page uses the original row index and survives navigating away", () => {
  const rows = Array.from({ length: 999 }, (_, index) => ({ title: `Product ${index}` }))
  const window = bulkPreviewPage(rows.length, 4)
  rows[window.start + 2] = { title: "Edited product" }
  assert.equal(rows[2].title, "Product 2")
  const back = bulkPreviewPage(rows.length, 4)
  assert.equal(rows.slice(back.start, back.end)[2].title, "Edited product")
  assert.equal(rows.length, 999)
})

test("empty, single-page and out-of-range pages have bounded offsets", () => {
  assert.deepEqual(bulkPreviewPage(0, 1), { page: 1, pageCount: 1, start: 0, end: 0 })
  assert.deepEqual(bulkPreviewPage(50, 8), { page: 1, pageCount: 1, start: 0, end: 50 })
  assert.equal(bulkPreviewPage(51, -2).page, 1)
  assert.equal(bulkPreviewPage(51, 90).start, 50)
})
