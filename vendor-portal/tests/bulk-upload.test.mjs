import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load('node:test')
const assert = load('node:assert/strict')
const fs = load('node:fs')
const ts = load('typescript')
// Test the same TypeScript contract that the browser imports, without a second parser implementation.
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const XLSX = load('xlsx')
const { parseRows, applyGroupValidation, productGroupKey, rowOptionValues, normalizeImageKey, brandReady } = load('../lib/bulk-upload.ts')
const { buildBulkTemplate, readBulkWorkbook, loadAllReferences } = load('../lib/bulk-workbook.ts')
const { buildBulkPayload } = load('../lib/bulk-payload.ts')
const base = { Title: 'Bulk QA box', Brand: 'Test brand', 'Tax Code': 'GST_18', 'Price INR': '100', 'Inventory Count': '5' }
const parse = rows => parseRows(rows, [], [])
const file = (workbook, name = 'fixture.xlsx') => { const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } }
const workbook = (rows, headers) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, headers ? XLSX.utils.aoa_to_sheet([headers, ...rows]) : XLSX.utils.json_to_sheet(rows), 'Products'); return wb }

test('template v2 is blank, has complete references, and its separate examples parse', async () => {
  const wb = buildBulkTemplate([{ id: 'pcat_1', name: 'Kitchen' }], [{ id: 'pcol_1', title: 'Brand' }])
  assert.deepEqual(wb.SheetNames, ['Products', 'Examples', 'Instructions', 'Field Guide', 'GST Codes', 'Categories', 'Collections'])
  await assert.rejects(readBulkWorkbook(file(wb)), /No product rows/)
  const examples = XLSX.utils.sheet_to_json(wb.Sheets.Examples)
  assert.ok(parse(examples).every(row => !row.errors.length), JSON.stringify(parse(examples).map(r => r.errors)))
})

for (const [column, value] of [
  ['Price INR', '0'], ['Price INR', '-1'], ['Price INR', '₹100'], ['Price INR', '1,000'], ['Price INR', '100abc'], ['Price INR', '1.234'], ['Price INR', 'Infinity'],
  ['Discounted Price INR', '101'], ['Inventory Count', '1.2'], ['Inventory Count', '-1'], ['Inventory Count', '9007199254740992'], ['Weight', '2kg'], ['Height', '-2'],
  ['Managed Inventory', 'maybe'], ['Allow Backorder', 'maybe'], ['Discountable', 'maybe'], ['Managed Inventory', 2], ['Allow Backorder', -1], ['Tax Code', ''], ['Tax Code', 'GST_UNKNOWN'], ['GST Rate', '5'],
  ['Option 1 Name', 'Size'], ['Option 1 Value', 'M'], ['Visual Option Name', 'Color'], ['Handle', 'Invalid Handle'], ['Country of Origin', 'India'], ['Shipping Profile ID', 'random'], ['Video URLs', 'http://example.com/video.mp4'],
]) test(`rejects invalid ${column}: ${value}`, () => assert.ok(parse([{ ...base, [column]: value }])[0].errors.length))

test('derives GST including zero, preserves identifier text, accepts strict booleans and zero stock', () => {
  const [row] = parse([{ ...base, SKU: '0000123', 'HS Code': '00123', 'MID Code': '0001', 'Tax Code': 'GST_0', 'GST Rate': '0', 'Inventory Count': '0', 'Managed Inventory': 'No', 'Allow Backorder': 'true', 'Discounted Price INR': '0', 'Country of Origin': 'in' }])
  assert.deepEqual(row.errors, []); assert.equal(row.gstRate, 0); assert.equal(row.sku, '0000123'); assert.equal(row.hsCode, '00123'); assert.equal(row.countryOfOrigin, 'IN'); assert.equal(row.managedInventory, false); assert.equal(row.allowBackorder, true)
  assert.equal(buildBulkPayload([row], {}).variants[0].prices[1].amount, 0)
})

test('case-insensitive duplicate SKUs mark both rows and block the whole product', () => {
  const rows = parse([{ ...base, SKU: 'QA-SKU', 'Option 1 Name': 'Size', 'Option 1 Value': 'M' }, { ...base, SKU: 'qa-sku', 'Option 1 Name': 'Size', 'Option 1 Value': 'L' }])
  assert.ok(rows.every(r => r.errors.some(e => e.includes('Duplicate SKU'))))
  assert.throws(() => buildBulkPayload(rows, {}), /validation/)
})

test('one bad variant blocks all rows; correcting it clears derived group errors', () => {
  const rows = parse([{ ...base, 'Option 1 Name': 'Size', 'Option 1 Value': 'M' }, { ...base, 'Price INR': '-2', 'Option 1 Name': 'Size', 'Option 1 Value': 'L' }])
  assert.ok(rows.every(r => r.errors.length))
  rows[1] = { ...rows[1], price: '100', errors: [] }
  assert.ok(applyGroupValidation(rows).every(r => !r.errors.length))
})

test('product-level conflicts and duplicate combinations block every variant', () => {
  for (const change of [{ Brand: 'Different' }, { Description: 'different' }, { 'Tax Code': 'GST_5' }, { 'Option 1 Value': 'M' }]) {
    const rows = parse([{ ...base, 'Option 1 Name': 'Size', 'Option 1 Value': 'M' }, { ...base, 'Option 1 Name': 'Size', 'Option 1 Value': 'L', ...change }])
    assert.ok(rows.every(r => r.errors.length))
  }
})

test('handles distinguish same-title products; dynamic option pairs and visual galleries survive payload', () => {
  const one = { ...base, Handle: 'qa-a', 'Option 1 Name': 'Size', 'Option 1 Value': 'M', 'Option 2 Name': 'Color', 'Option 2 Value': 'Red', 'Option 3 Name': 'Fit', 'Option 3 Value': 'Slim', 'Option 4 Name': 'Pack', 'Option 4 Value': '2', 'Visual Option Name': 'Color', 'Visual Option Value': 'Red', 'Visual Image Refs': 'red.jpg', 'Video URLs': 'https://example.com/video.mp4', 'Shipping Profile ID': 'sp_123', Height: '2', Weight: '0.5', Description: 'A useful box with a removable lid and clear sides.' }
  const rows = parse([one, { ...one, Handle: 'qa-b' }]); assert.ok(rows.every(r => !r.errors.length)); assert.notEqual(productGroupKey(rows[0]), productGroupKey(rows[1]))
  assert.equal(Object.keys(rowOptionValues(rows[0])).length, 4)
  assert.deepEqual(Object.keys(rowOptionValues(rows[0])), ['Size', 'Color', 'Fit', 'Pack'])
  const payload = buildBulkPayload([rows[0]], { 'red.jpg': { status: 'uploaded', url: 'https://example.com/red.jpg' } })
  assert.equal(payload.metadata.gst_rate, 18); assert.equal(payload.shipping_profile_id, 'sp_123'); assert.equal(payload.weight, 0.5); assert.equal(payload.metadata.videos[0].url, one['Video URLs']); assert.match(payload.description, /<(p|h3)>/); assert.equal(payload.options.length, 4); assert.equal(payload.images[0].url, payload.metadata.color_images.Red[0])
  assert.throws(() => buildBulkPayload([rows[0]], {}), /Missing image/)
})

test('image filenames match case-insensitively but signed HTTPS paths retain case', () => {
  assert.equal(normalizeImageKey('SHIRT.JPG'), 'shirt.jpg')
  assert.notEqual(normalizeImageKey('https://example.com/A.jpg'), normalizeImageKey('https://example.com/a.jpg'))
})

test('reader preserves blank-row positions, numeric raw values and leading-zero text identifiers', async () => {
  const wb = workbook([['Box', 'Test', 'GST_18', 1234, '00123'], [], ['Box 2', 'Test', 'GST_0', 12, '00001']], ['Title *', 'Brand *', 'Tax Code *', 'Price INR *', 'HS Code'])
  wb.Sheets.Products.D2.z = '#,##0'
  const { json } = await readBulkWorkbook(file(wb)); assert.equal(json[0]['Price INR *'], 1234); assert.equal(json[1].__rowNumber, 4); assert.equal(json[0]['HS Code'], '00123')
})

for (const [name, mutate, message] of [
  ['duplicate headers', wb => { wb.Sheets.Products.E1 = { t: 's', v: 'Title' }; wb.Sheets.Products['!ref'] = 'A1:E2' }, /Duplicate column/],
  ['unknown headers', wb => { wb.Sheets.Products.E1 = { t: 's', v: 'Typo' }; wb.Sheets.Products['!ref'] = 'A1:E2' }, /Unsupported column/],
  ['missing tax column', wb => { wb.Sheets.Products.C1.v = 'GST Rate' }, /Missing required columns/],
  ['formulas', wb => { wb.Sheets.Products.D2 = { t: 'n', v: 100, f: '50+50' } }, /formulas/],
  ['merged cells', wb => { wb.Sheets.Products['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }] }, /Unmerge/],
  ['row limit', wb => { wb.Sheets.Products.A1002 = { t: 's', v: 'too many' }; wb.Sheets.Products['!ref'] = 'A1:D1002' }, /Maximum 1000/],
]) test(`reader rejects ${name}`, async () => { const wb = workbook([base]); mutate(wb); await assert.rejects(readBulkWorkbook(file(wb)), message) })

test('file type and size limits apply before file parsing', async () => {
  await assert.rejects(readBulkWorkbook({ name: 'test.exe', size: 1 }), /Choose an/)
  await assert.rejects(readBulkWorkbook({ name: 'test.xlsx', size: 11 * 1024 * 1024 }), /10 MB/)
})

test('all reference pages load, incomplete pages fail instead of inventing category requests', async () => {
  const offsets = []
  assert.deepEqual(await loadAllReferences(async offset => { offsets.push(offset); return { items: offset ? [3] : [1, 2], count: 3 } }), [1, 2, 3]); assert.deepEqual(offsets, [0, 2])
  await assert.rejects(loadAllReferences(async () => ({ items: [], count: 1 })), /incomplete/)
})

test('CSV and legacy XLS imports retain supported values', async () => {
  const csv = Buffer.from('Title,Brand,Tax Code,Price INR,SKU,HS Code\nCSV QA,Test,GST_18,99,00012,00123\n')
  const { json } = await readBulkWorkbook({ name: 'qa.csv', size: csv.length, arrayBuffer: async () => csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength) })
  const [row] = parse(json); assert.deepEqual(row.errors, []); assert.equal(row.sku, '00012'); assert.equal(row.hsCode, '00123')
  const bytes = XLSX.write(workbook([base]), { type: 'buffer', bookType: 'biff8' })
  const legacy = await readBulkWorkbook({ name: 'qa.xls', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  assert.deepEqual(parse(legacy.json)[0].errors, [])
})

test('too many variants and repeated option names are rejected', () => {
  assert.ok(parse(Array.from({ length: 101 }, (_, i) => ({ ...base, 'Option 1 Name': 'Size', 'Option 1 Value': String(i) }))).every(r => r.errors.some(e => e.includes('100 variants'))))
  assert.ok(parse([{ ...base, 'Option 1 Name': 'Size', 'Option 1 Value': 'M', 'Option 2 Name': 'size', 'Option 2 Value': 'L' }])[0].errors.some(e => e.includes('Duplicate option')))
})

test('unknown category/collection requests survive; a subcategory matches within its parent', () => {
  const categories = [{ id: 'parent', name: 'Kitchen' }, { id: 'child', name: 'Kettle', parent_category_id: 'parent' }]
  const [row] = parseRows([{ ...base, Category: 'Kitchen', Subcategory: 'Kettle', Collection: 'New collection' }], categories, [])
  assert.equal(row.selectedCategoryId, 'child'); assert.equal(row.collectionRequest, 'New collection')
  const payload = buildBulkPayload([row], {}); assert.equal(payload.metadata.collection_request_status, 'pending'); assert.deepEqual(payload.category_ids, ['child'])
})

test('brand submission requires an actual uploaded letter and respects rejected / loading states', () => {
  assert.equal(brandReady(undefined), false)
  for (const status of ['authorized', 'pending', 'uploaded']) {
    assert.equal(brandReady({ status }), false)
    assert.equal(brandReady({ status, fileUrl: 'https://example.com/letter.pdf' }), true)
  }
  for (const status of ['missing', 'rejected', 'checking', 'uploading', 'error']) assert.equal(brandReady({ status, fileUrl: 'https://example.com/letter.pdf' }), false)
})
