const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../vendor-portal/node_modules/typescript')
const root = path.resolve(__dirname, '..')
function compile(relative, requireModule, globals = {}) {
  const filename = path.join(root, relative)
  const sandbox = { exports: {}, require: requireModule, console: { log() {}, warn() {}, error() {} }, ...globals }
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(code, sandbox, { filename })
  return sandbox.exports
}
async function brandField(status, shared) {
  const effects = [], timers = [], states = [], checks = [], decisions = []
  let stateIndex = 0
  const react = {
    useState(initial) { const i = stateIndex++; states[i] = initial; return [initial, next => { states[i] = next }] },
    useEffect(effect) { effects.push(effect) },
    useRef(value) { return { current: value } },
  }
  const component = compile('vendor-portal/components/BrandAuthorizationField.tsx', name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return require('../vendor-portal/node_modules/react/jsx-runtime')
    if (name === '@medusajs/ui') return { Input: 'input', Text: 'p', toast: { error() {} } }
    if (name === '@/lib/api/client') return { vendorBrandsApi: { async checkAuthorization(brand) { checks.push(brand); return { status, requires_authorization: status !== 'authorized' } } } }
    throw Error('Unexpected import: ' + name)
  }, { localStorage: { getItem: () => 'fixture-token' }, setTimeout(fn) { timers.push(fn); return timers.length }, clearTimeout() {} })
  component.BrandAuthorizationField({ brand: 'Pigeon', requireNewUpload: shared, onBrandChange() {}, onFileSelect() {}, onAuthorizationStatusChange: (...args) => decisions.push(args) })
  effects.forEach(effect => effect())
  for (const timer of timers) await timer()
  return { status: states[0], checks, decision: decisions.at(-1) }
}
for (const shared of [false, true]) {
  test(`approved vendor-brand authorization is reused (${shared ? 'shared' : 'ordinary'} form)`, async () => {
    const result = await brandField('authorized', shared)
    assert.equal(result.status, 'authorized')
    assert.deepEqual(result.checks, ['Pigeon'])
    assert.deepEqual(result.decision, [true, false])
  })
}
for (const status of ['missing', 'rejected', 'pending']) {
  test(`shared form still requires a letter when authorization is ${status}`, async () => {
    const result = await brandField(status, true)
    assert.equal(result.status, 'needs_upload')
    assert.deepEqual(result.decision, [false, true])
  })
}
test('ordinary pending-letter behavior is preserved', async () => {
  const result = await brandField('pending', false)
  assert.equal(result.status, 'pending')
  assert.deepEqual(result.decision, [true, true])
})
async function createProduct({ authorization, shared = true, submittedBrand = 'Pigeon', validLink = true, vendor = 'receiving-vendor', key } = {}) {
  const lookups = [], downstream = []
  class CatalogConflict extends Error {}
  const source = { id: 'source-product', metadata: { brand: 'Pigeon', catalog_share_hash: 'fixture-share-hash' }, variants: [{ sku: 'PIGEON-1' }] }
  const route = compile('my-medusa-store/src/api/vendor/products/route.ts', name => {
    if (name.endsWith('/product-share')) return { loadShareProduct: async () => source, validProductShare: () => validLink }
    if (name.endsWith('/shared-catalog-offer')) return {
      prepareSharedCatalogOffer: async (_scope, vendorId) => { downstream.push(vendorId); throw Error('TEST_STOP_BEFORE_PRODUCT_CREATION') },
    }
    if (name.endsWith('/catalog-identity')) return {
      CatalogConflict, withCatalogLock: async (_scope, fn) => fn(), publicVariantSku: (_product, variant) => variant.sku,
      prepareCatalogOffer: async (_scope, vendorId) => { downstream.push(vendorId); throw Error('TEST_STOP_BEFORE_PRODUCT_CREATION') },
    }
    if (name === '../_lib/guards') return { requireApprovedVendor: async () => ({ vendor_id: vendor }) }
    return {}
  }, { process: { env: { NODE_ENV: 'test' } } })
  const req = { body: { title: 'Pigeon product', metadata: { brand: submittedBrand }, variants: [{ sku: 'PIGEON-1' }], ...(shared ? { shared_product_id: source.id, share_token: 'fixture', shared_brand_authorization_key: key } : {}) }, scope: { resolve(name) {
    assert.equal(name, 'vendorBrandAuthorization')
    return { async getBrandAuthorization(vendorId, brand) { lookups.push([vendorId, brand]); return authorization } }
  } } }
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await route.POST(req, res)
  return { lookups, downstream, response: res }
}
const approved = { verified: true, authorization_file_url: 'fixture-letter', authorization_file_key: 'existing-letter', metadata: { review_status: 'approved' } }
test('shared create accepts the receiving vendor’s existing approved letter without a share-specific key', async () => {
  const result = await createProduct({ authorization: approved })
  assert.deepEqual(result.lookups, [['receiving-vendor', 'Pigeon']])
  assert.deepEqual(result.downstream, ['receiving-vendor'])
})
test('an approved letter from another shared product can be reused', async () => {
  const result = await createProduct({ authorization: { ...approved, metadata: { shared_product_id: 'older-product', shared_product_share_hash: 'older-hash' } } })
  assert.equal(result.downstream.length, 1)
})
for (const [name, authorization] of [['missing', null], ['pending', { ...approved, verified: false }], ['rejected', { ...approved, verified: false, metadata: { review_status: 'rejected' } }]]) {
  test(`shared create blocks a ${name} receiving-vendor letter without a valid new upload`, async () => {
    const result = await createProduct({ authorization })
    assert.equal(result.response.statusCode, 400)
    assert.equal(result.downstream.length, 0)
  })
}
test('a newly uploaded, share-bound pending letter still permits draft creation', async () => {
  const result = await createProduct({ authorization: { ...approved, verified: false, metadata: { shared_product_id: 'source-product', shared_product_share_hash: 'fixture-share-hash' } }, key: 'existing-letter' })
  assert.equal(result.downstream.length, 1)
})
test('ordinary product creation keeps its existing pending-letter behavior', async () => {
  const result = await createProduct({ authorization: { ...approved, verified: false }, shared: false })
  assert.equal(result.downstream.length, 1)
})
test('another vendor’s approval cannot authorize the receiving vendor', async () => {
  const result = await createProduct({ authorization: null, vendor: 'different-vendor' })
  assert.deepEqual(result.lookups, [['different-vendor', 'Pigeon']])
  assert.equal(result.downstream.length, 0)
})
test('an approved unrelated brand cannot bypass the shared product brand check', async () => {
  const result = await createProduct({ authorization: approved, submittedBrand: 'Crompton' })
  assert.equal(result.response.statusCode, 409)
  assert.equal(result.lookups.length, 0)
  assert.equal(result.downstream.length, 0)
})
test('expired sharing links are still rejected before authorization reuse', async () => {
  const result = await createProduct({ authorization: approved, validLink: false })
  assert.equal(result.response.statusCode, 404)
  assert.equal(result.downstream.length, 0)
})
function submitBrandGate({ needsAuthorization, authorized = true, file = null, key = null }) {
  const relative = 'vendor-portal/app/products/new/page.tsx'
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let submit
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSubmit') submit = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(submit)
  const messages = []
  const sandbox = {
    exports: {}, shareLoading: false, shareError: null, sharedProduct: { id: 'fixture' },
    formData: { title: 'Pigeon product', brand: 'Pigeon', taxCode: '' },
    brandIsAuthorized: authorized, brandNeedsAuthorization: needsAuthorization,
    brandAuthorizationFile: file, sharedBrandAuthorizationKey: key,
    toast: { error: (_title, options) => messages.push(options.description) },
  }
  vm.runInNewContext(ts.transpileModule('exports.submit = ' + submit, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, sandbox)
  return sandbox.exports.submit().then(() => messages)
}
test('Publish does not demand a share-specific upload after an approved brand check', async () => {
  assert.deepEqual(await submitBrandGate({ needsAuthorization: false }), ['Tax Code (GST) is required'])
})
test('Publish still blocks an unapproved shared listing without a new letter', async () => {
  assert.deepEqual(await submitBrandGate({ needsAuthorization: true, authorized: false }), ['Upload your own brand authorization letter for this shared product'])
})
test('Publish preserves retries after a shared letter was uploaded', async () => {
  assert.deepEqual(await submitBrandGate({ needsAuthorization: true, key: 'uploaded-fixture-key' }), ['Tax Code (GST) is required'])
})
