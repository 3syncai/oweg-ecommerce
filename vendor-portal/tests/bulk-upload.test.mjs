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
const { buildBulkTemplate, serializeBulkTemplate, readBulkWorkbook, loadAllReferences } = load('../lib/bulk-workbook.ts')
const { buildBulkPayload } = load('../lib/bulk-payload.ts')
const base = { Title: 'Bulk QA box', Brand: 'Test brand', 'Tax Code': 'GST_18', 'Price INR': '100', 'Inventory Count': '5' }
const parse = rows => parseRows(rows, [], [])
const file = (workbook, name = 'fixture.xlsx') => { const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } }
const workbook = (rows, headers) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, headers ? XLSX.utils.aoa_to_sheet([headers, ...rows]) : XLSX.utils.json_to_sheet(rows), 'Products'); return wb }

test('template v3 is blank, has complete references, and its separate examples parse', async () => {
  const wb = buildBulkTemplate([{ id: 'pcat_1', name: 'Kitchen' }], [{ id: 'pcol_1', title: 'Brand' }])
  assert.deepEqual(wb.SheetNames, ['Products', 'Examples', 'Instructions', 'Field Guide', 'GST Codes', 'Categories', 'Brands'])
  await assert.rejects(readBulkWorkbook(file(wb)), /No product rows/)
  const examples = XLSX.utils.sheet_to_json(wb.Sheets.Examples)
  assert.ok(parse(examples).every(row => !row.errors.length), JSON.stringify(parse(examples).map(r => r.errors)))
})

for (const [column, value] of [
  ['Price INR', '0'], ['Price INR', '-1'], ['Price INR', '₹100'], ['Price INR', '1,000'], ['Price INR', '100abc'], ['Price INR', '1.234'], ['Price INR', 'Infinity'],
  ['Discounted Price INR', '101'], ['Inventory Count', '1.2'], ['Inventory Count', '-1'], ['Inventory Count', '9007199254740992'], ['Weight', '2kg'], ['Height', '-2'],
  ['Managed Inventory', 'maybe'], ['Allow Backorder', 'maybe'], ['Discountable', 'maybe'], ['Managed Inventory', 2], ['Allow Backorder', -1], ['Tax Code', ''], ['Tax Code', 'GST_UNKNOWN'], ['GST Rate', '5'],
  ['Option 1 Name', 'Size'], ['Option 1 Value', 'M'], ['Visual Option Name', 'Color'], ['Handle', 'Invalid Handle'], ['Country of Origin', 'India'], ['Video URLs', 'http://example.com/video.mp4'],
]) test(`rejects invalid ${column}: ${value}`, () => assert.ok(parse([{ ...base, [column]: value }])[0].errors.length))

test('derives GST including zero, preserves identifier text, accepts strict booleans and zero stock', () => {
  const [row] = parse([{ ...base, SKU: '0000123', 'HS Code': '00123', 'MID Code': '0001', 'Tax Code': 'GST_0', 'GST Rate': '0', 'Inventory Count': '0', 'Managed Inventory': 'Yes', 'Allow Backorder': 'true', 'Discounted Price INR': '0', 'Country of Origin': 'in' }])
  assert.deepEqual(row.errors, []); assert.equal(row.gstRate, 0); assert.equal(row.sku, '0000123'); assert.equal(row.hsCode, '00123'); assert.equal(row.countryOfOrigin, 'IN'); assert.equal(row.managedInventory, true); assert.equal(row.allowBackorder, true)
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
  assert.equal(payload.metadata.gst_rate, 18); assert.equal(payload.shipping_profile_id, null); assert.equal(payload.weight, 0.5); assert.equal(payload.metadata.videos[0].url, one['Video URLs']); assert.match(payload.description, /<(p|h3)>/); assert.equal(payload.options.length, 4); assert.equal(payload.images[0].url, payload.metadata.color_images.Red[0])
  assert.throws(() => buildBulkPayload([rows[0]], {}), /Missing image/)
})

test('image filenames match case-insensitively but signed HTTPS paths retain case', () => {
  assert.equal(normalizeImageKey('SHIRT.JPG'), 'shirt.jpg')
  assert.notEqual(normalizeImageKey('https://example.com/A.jpg'), normalizeImageKey('https://example.com/a.jpg'))
})

test('reader preserves blank-row positions, numeric raw values and leading-zero text identifiers', async () => {
  const wb = workbook([['Box', 'Test', 'GST_18', 1234, '00123', 5], [], ['Box 2', 'Test', 'GST_0', 12, '00001', 0]], ['Title *', 'Brand *', 'Tax Code *', 'Price INR *', 'HS Code', 'Inventory Count'])
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
  const csv = Buffer.from('Title,Brand,Tax Code,Price INR,SKU,HS Code,Inventory Count\nCSV QA,Test,GST_18,99,00012,00123,2\n')
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
  assert.equal(row.selectedCategoryId, 'child'); assert.equal(row.collectionRequest, 'Test brand')
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


test('v3 hides removed inputs and labels optional and mandatory columns', async () => {
  const { TEMPLATE_HEADERS } = load('../lib/bulk-upload.ts')
  const names = TEMPLATE_HEADERS.map(h => h.key)
  for (const name of ['Additional Category IDs', 'Collection', 'MID Code', 'HS Code', 'Shipping Profile ID', 'Brand Letter', 'Visual Option Name', 'Price INR']) assert.ok(!names.includes(name), name)
  assert.ok(names.includes('Subtitle (optional)')); assert.ok(names.includes('Handle (optional)')); assert.ok(names.includes('HSN Code'))
  assert.ok(names.indexOf('Video URLs') > names.indexOf('Image 5'))
  for (let n = 1; n <= 3; n++) assert.equal(names.indexOf(`Option ${n} Images`), names.indexOf(`Option ${n} Value`) + 1)
  assert.ok(TEMPLATE_HEADERS.find(h => h.key === 'Inventory Count').required)
})

test('serialized template contains a real tax dropdown, protected calculation cells and unlocked inputs', async () => {
  const JSZip = load('jszip')
  const bytes = await serializeBulkTemplate(buildBulkTemplate())
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string')
  assert.ok(xml.indexOf("<dataValidations") < xml.indexOf("<ignoredErrors"));
  assert.match(xml, /dataValidation type="list"/); assert.match(xml, /<formula1>OWEGTaxCodes<\/formula1>/)
  assert.match(await zip.file('xl/workbook.xml').async('string'), /fullCalcOnLoad="1"/);
  assert.match(xml, /<sheetProtection/); assert.match(xml, /VLOOKUP/); assert.match(xml, /ROUND/)
  assert.match(await zip.file('xl/styles.xml').async('string'), /protection locked="0"/)
  const wb = XLSX.read(bytes, { type: 'array' }); const sheet = wb.Sheets.Products
  assert.ok(sheet.R2.f); assert.equal(sheet.A2.s, undefined)
  await assert.rejects(readBulkWorkbook({ name: 'blank.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }), /No product rows/)
})

test('comma-separated sizes and colors generate nine unique variants with the correct galleries and fixed inventory', () => {
  const rows = parse([{ ...base, 'MRP INR': 200, 'Discounted Price INR (optional)': 150, 'Option 1 Name': 'Size', 'Option 1 Value': '8,9,10', 'Option 1 Images': 'size.jpg', 'Option 2 Name': 'Color', 'Option 2 Value': 'Red,Green,Blue', 'Option 2 Images': 'red.jpg,green.jpg,blue.jpg', SKU: 'SHOE' }])
  assert.equal(rows.length, 9); assert.ok(rows.every(r => !r.errors.length), JSON.stringify(rows.map(r => r.errors)))
  assert.equal(new Set(rows.map(r => r.sku)).size, 9); assert.equal(rows[8].sku, 'SHOE-9')
  const images = Object.fromEntries(['size', 'red', 'green', 'blue'].map(name => [`${name}.jpg`, { status: 'uploaded', url: `https://example.com/${name}.jpg` }]))
  const payload = buildBulkPayload(rows, images)
  assert.equal(payload.variants.length, 9); assert.equal(rows[0].discountPercent, 25)
  assert.deepEqual(payload.metadata.color_images.Red, ['https://example.com/red.jpg'])
  assert.deepEqual(payload.metadata.option_images.Size['8'], ['https://example.com/size.jpg'])
  assert.ok(payload.variants.every(v => v.manage_inventory && v.allow_backorder && v.inventory_quantity === 5))
  assert.equal(payload.metadata.tax_country, 'IN'); assert.equal(rows[0].collection, base.Brand)
})

for (const patch of [
  { 'Inventory Count': '' }, { 'Inventory Count': '1.1' }, { 'Managed Inventory': 'No' }, { 'Allow Backorder': 'No' },
  { 'Tax Code': '', 'GST Rate': 18 }, { 'Option 1 Name': 'Size', 'Option 1 Value': '8,8' },
  { 'Option 1 Name': 'Color', 'Option 1 Value': 'Red,Blue,Green', 'Option 1 Images': 'red.jpg,blue.jpg' },
  { 'Option 1 Images': 'orphan.jpg' },
  { 'Option 1 Name': 'Size', 'Option 1 Value': Array.from({length:101}, (_,i)=>i).join(',') },
]) test(`v3 rejects invalid configuration ${JSON.stringify(patch)}`, () => assert.ok(parse([{...base, ...patch}])[0].errors.length))

test('formulas and stale caches in calculated fields cannot override GST or discount', async () => {
  const wb = buildBulkTemplate()
  const { TEMPLATE_HEADERS } = load('../lib/bulk-upload.ts')
  for (const [key, value] of Object.entries({Title:'Bajaj Electric Kettle',Description:'Stainless steel electric kettle.',Category:'Home appliances',Subcategory:'Kettles','HSN Code':'85167920','Country of Origin':'IN','Length (cm)':22,'Width (cm)':20,'Height (cm)':24,'Weight (kg)':1.2,'Image 1':'front.jpg','Image 2':'side.jpg','Image 3':'detail.jpg',Brand:'Existing brand','Tax Code':'GST_0.25','MRP INR':100,'Selling Price INR':80,'Inventory Count':0})) {
    const c = TEMPLATE_HEADERS.findIndex(h => h.key === key || h.key.replace(/ \(.*\)/,'') === key)
    wb.Sheets.Products[XLSX.utils.encode_cell({r:1,c})] = {t:typeof value === 'number'?'n':'s',v:value}
  }
  const gst = TEMPLATE_HEADERS.findIndex(h => h.key === 'GST Rate (auto)')
  wb.Sheets.Products[XLSX.utils.encode_cell({r:1,c:gst})].v = 99
  const {json} = await readBulkWorkbook(file(wb)); assert.equal(json.length,1)
  const rows = parseRows(json, [], [{ id:'pcol_existing',title:'Existing brand' }]); assert.deepEqual(rows[0].errors, [])
  assert.equal(rows[0].gstRate,0.25); assert.equal(rows[0].discountPercent,20); assert.equal(rows[0].countryOfOrigin,'IN')
  assert.equal(rows[0].selectedCollectionId,'pcol_existing'); assert.equal(rows[0].inventoryCount,'0')
})


test('each supported Tax Code controls its GST rate, and missing code never accepts GST alone', () => {
  const {GST_TAX_CODES} = load('../lib/gst-tax-codes.ts')
  for(const code of GST_TAX_CODES){const [row]=parse([{...base,'Tax Code':code.code}]);assert.deepEqual(row.errors,[]);assert.equal(row.gstRate,code.rate)}
})

test('reader rejects ambiguous legacy/new price or HSN columns', async () => {
  for(const patch of [{'MRP INR':200},{'HS Code':'001','HSN Code':'002'}]) await assert.rejects(readBulkWorkbook(file(workbook([{...base,...patch}]))), /Duplicate column/)
})


test('preview edits keep expanded variants together, preserve other products and revalidate blank titles', () => {
  const {editBulkProduct} = load('../lib/bulk-upload.ts')
  let rows=parse([{...base,'Option 1 Name':'Size','Option 1 Value':'8,9'},{...base,'Option 1 Name':'Size','Option 1 Value':'10'},{...base,Title:'Other product'}])
  rows=editBulkProduct(rows,1,{title:'Renamed shoe',type:'Shoe',tags:['QA'],categoryRequest:'Footwear'})
  assert.equal(new Set(rows.slice(0,3).map(productGroupKey)).size,1);assert.ok(rows.slice(0,3).every(r=>r.title==='Renamed shoe'&&r.type==='Shoe'&&r.tags[0]==='QA'&&r.categoryRequest==='Footwear'&&!r.errors.length));assert.equal(rows[3].title,'Other product')
  rows=editBulkProduct(rows,0,{title:''});assert.ok(rows.slice(0,3).every(r=>r.errors.length));rows=editBulkProduct(rows,0,{title:'Recovered'});assert.ok(rows.slice(0,3).every(r=>!r.errors.length))
})
const { calculateBulkListing, bulkPricingSignature, resolveBulkListing, bulkPricingReady } = load('../lib/bulk-pricing.ts')
const shippingQuote = (fee = 90) => ({ success: true, freight_charge: fee, coverage_complete: true, expires_at: new Date(Date.now()+60000).toISOString(), routes: [{ status: 'quoted', quote: { freight_charge: fee } }] })
const modern = { Title:'Bajaj KTX 1.8L DLX Electric Kettle',Description:'Stainless steel kettle with automatic shut-off.',Brand:'Bajaj',Category:'Home appliances',Subcategory:'Kettles','Length (cm)':22,'Width (cm)':20,'Height (cm)':24,'Weight (kg)':1.2,'HSN Code':'85167920','Country of Origin':'IN','Tax Code':'GST_18','MRP INR':2150,'Selling Price INR':1000,'Inventory Count':12,'Image 1':'front.jpg','Image 2':'side.jpg','Image 3':'detail.jpg' }

test('changing shipping preserves every non-logistics calculation and rejects expired quotes',()=>{
 const first=calculateBulkListing(1000,90,18).calculation,second=calculateBulkListing(1000,193.77,18).calculation
 for(const field of ['item','platformFee','commissionFee','partnerCommission','paymentGatewayFee','tcs','tds'])assert.deepEqual(first[field],second[field],field)
 assert.equal(second.logistics.gstOrTax,34.88)
 const row=parse([modern])[0]
 row.listingPricing={signature:bulkPricingSignature(row),logisticsFee:193.77,suggestedPrice:1457.14,listingPrice:'1457.14',shippingEstimate:{...shippingQuote(193.77),expires_at:new Date(Date.now()-1000).toISOString()}}
 assert.throws(()=>resolveBulkListing(row),/expired/)
 row.listingPricing.shippingEstimate.expires_at=new Date(Date.now()+60000).toISOString()
 assert.ok(bulkPricingReady(row))
 row.listingPricing.shippingEstimate.coverage_complete=false
 assert.ok(bulkPricingReady(row)); assert.equal(resolveBulkListing(row).decision.logisticsFee,193.77)
})

test('base cost build-up adds existing calculator charges once without reverse settlement targeting',()=>{
 const result=calculateBulkListing(1000,90,18)
 assert.equal(result.suggestedPrice,1334.69)
 assert.equal(result.calculation.item.total,1000)
 assert.equal(result.calculation.logistics.total,106.2)
 for(const args of [[0,90,18],[100,-1,18],[100,NaN,18],[100,90,NaN]])assert.throws(()=>calculateBulkListing(...args))
})

test('client-format mandatory cells, units and header aliases are enforced',()=>{
 assert.deepEqual(parse([modern])[0].errors,[])
 assert.equal(parse([modern])[0].weight,'1.2')
 for(const field of ['Description','Category','Subcategory','Length (cm)','Width (cm)','Height (cm)','Weight (kg)','HSN Code','Country of Origin','Selling Price INR','Image 1','Image 2','Image 3'])assert.ok(parse([{...modern,[field]:''}])[0].errors.length,field)
 for(const value of ['-1','2kg','0','Infinity'])assert.ok(parse([{...modern,'Weight (kg)':value}])[0].errors.length)
})

test('final payload uses edited listing and calculated retail MRP while retaining source base prices',()=>{
 const row=parse([modern])[0]
 const images=Object.fromEntries(['front','side','detail'].map(n=>[n+'.jpg',{status:'uploaded',url:'https://example.com/'+n+'.jpg'}]))
 assert.throws(()=>buildBulkPayload([row],images,true),/Calculate listing/)
 row.listingPricing={signature:bulkPricingSignature(row),logisticsFee:90,suggestedPrice:1334.69,listingPrice:'1400.50',shippingEstimate:shippingQuote()}
 assert.ok(bulkPricingReady(row))
 const payload=buildBulkPayload([row],images,true)
 assert.equal(payload.variants[0].prices[1].amount,1400.5)
 assert.ok(payload.variants[0].prices[0].amount>=1400.5)
 assert.equal(payload.variants[0].metadata.bulk_base_pricing.base_mrp,2150)
 assert.equal(payload.variants[0].metadata.bulk_base_pricing.base_selling_price,1000)
 assert.equal(payload.variants[0].metadata.bulk_base_pricing.method,'base_plus_calculator_costs')
 for(const price of ['', '0','NaN','Infinity','12.345','-2']) { row.listingPricing.listingPrice=price; assert.equal(bulkPricingReady(row),false) }
 row.listingPricing.listingPrice='1500'; row.weight='2'; assert.equal(bulkPricingReady(row),false)
 assert.throws(()=>resolveBulkListing(row),/Calculate listing/)
})

test('changing only one variant listing preserves the other variant price',()=>{
 const rows=parse([{...modern,'Option 1 Name':'Colour','Option 1 Value':'Silver,Black'}])
 for(const [index,row] of rows.entries())row.listingPricing={signature:bulkPricingSignature(row),logisticsFee:90,suggestedPrice:1334.69,listingPrice:String(1500+index*100),shippingEstimate:shippingQuote()}
 const images=Object.fromEntries(['front','side','detail'].map(n=>[n+'.jpg',{status:'uploaded',url:'https://example.com/'+n+'.jpg'}]))
 const p=buildBulkPayload(rows,images,true)
 assert.deepEqual(p.variants.map(v=>v.prices[1].amount),[1500,1600])
})

test('template v4 styles mandatory headers distinctly and emits consistent native style records',async()=>{
 const JSZip=load('jszip');const bytes=await serializeBulkTemplate(buildBulkTemplate());const zip=await JSZip.loadAsync(bytes)
 const styles=await zip.file('xl/styles.xml').async('string'),sheet=await zip.file('xl/worksheets/sheet1.xml').async('string')
 const xfs=styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/)
 assert.equal(Number(xfs[1]),(xfs[2].match(/<xf\b/g)||[]).length)
 assert.match(styles,/FFD96950/);assert.match(styles,/FF344B44/)
 const titleStyle=sheet.match(/<c r="A1"[^>]*s="(\d+)"/)[1],subtitleStyle=sheet.match(/<c r="B1"[^>]*s="(\d+)"/)[1]
 assert.notEqual(titleStyle,subtitleStyle)
})
