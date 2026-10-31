const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const ts = require('typescript')
const backendRequire = createRequire(path.resolve('my-medusa-store/package.json'))
const { patchMediaSource } = require('../my-medusa-store/scripts/patch-product-media.cjs')

function loadTs(source, globals = {}) {
  const module = { exports: {} }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, require: backendRequire, ...globals })
  return module.exports
}

test('real S3 provider uploads without an ACL header, retaining URLs, file content and provider identity', async () => {
  const { OwegS3FileService } = loadTs(fs.readFileSync('my-medusa-store/src/modules/oweg-s3/service.ts', 'utf8'))
  assert.equal(OwegS3FileService.identifier, 's3')
  const requests = []
  const provider = new OwegS3FileService({ logger: { error() {} } }, {
    region: 'ap-south-1', bucket: 'test-bucket', file_url: 'https://cdn.example.com',
    access_key_id: 'test-key', secret_access_key: 'test-secret',
    additional_client_config: { requestHandler: { handle: async request => {
      requests.push(request)
      return { response: { statusCode: 200, headers: { etag: '"test"' }, body: Buffer.from('') } }
    } } },
  })
  for (const access of ['public', 'private']) {
    const file = await provider.upload({ filename: 'photo.jpg', mimeType: 'image/jpeg', content: Buffer.from('test-image').toString('base64'), access })
    assert.match(file.url, /^https:\/\/cdn\.example\.com\/photo-.*\.jpg$/)
  }
  assert.equal(requests.length, 2)
  for (const request of requests) {
    assert.equal(request.headers['x-amz-acl'], undefined)
    assert.equal(request.headers['content-type'], 'image/jpeg')
    assert.equal(Buffer.from(request.body).toString(), 'test-image')
  }
  const signed = await provider.getPresignedUploadUrl({ filename: 'direct.jpg', mimeType: 'image/jpeg', access: 'public' })
  assert.equal(new URL(signed.url).searchParams.has('x-amz-acl'), false)
})

const editorPath = 'my-medusa-store/node_modules/@medusajs/dashboard/src/routes/products/product-media/components/edit-product-media-form/edit-product-media-form.tsx'
function editor(upload) {
  const source = patchMediaSource(fs.readFileSync(editorPath, 'utf8'))
  const body = source.slice(source.indexOf('const handleSubmit = form.handleSubmit'), source.indexOf('  const handleCheckedChange'))
  const saves = [], errors = []
  const { submit } = loadTs(body + '\nexport const submit = handleSubmit;', {
    form: { handleSubmit: fn => fn, setError: (...args) => errors.push(args) },
    sdk: { admin: { upload: { create: upload } } },
    mutateAsync: async payload => saves.push(payload), t: key => key,
  })
  return { submit, saves, errors }
}

test('failed, partial and invalid-URL uploads never issue a product update', async () => {
  for (const upload of [async () => { throw new Error('S3 failure') }, async () => ({ files: [] }), async () => ({ files: [{ url: '' }] })]) {
    const flow = editor(upload)
    await flow.submit({ media: [{ file: { name: 'new.jpg' }, isThumbnail: true }] })
    assert.equal(flow.saves.length, 0)
    assert.ok(flow.errors.length)
  }
})

test('successful replacement preserves order, retained images and thumbnail selection', async () => {
  const flow = editor(async () => ({ files: [{ url: 'https://cdn.example/new.jpg' }] }))
  await flow.submit({ media: [{ id: 'retained', url: 'https://cdn.example/old.jpg' }, { file: { name: 'new.jpg' }, isThumbnail: true }] })
  assert.equal(flow.saves.length, 1)
  assert.equal(flow.saves[0].images[0].id, 'retained')
  assert.equal(flow.saves[0].images[1].url, 'https://cdn.example/new.jpg')
  assert.equal(flow.saves[0].thumbnail, 'https://cdn.example/new.jpg')
  assert.equal(flow.errors.length, 0)
})

test('existing-media removal works without uploading and patch is repeatable', async () => {
  const flow = editor(async () => { throw new Error('must not upload') })
  await flow.submit({ media: [] })
  assert.equal(flow.saves.length, 1)
  assert.equal(flow.saves[0].images.length, 0)
  assert.equal(flow.saves[0].thumbnail, null)
  const source = fs.readFileSync(editorPath, 'utf8')
  assert.equal(patchMediaSource(patchMediaSource(source)), patchMediaSource(source))
})
