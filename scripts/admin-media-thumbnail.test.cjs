const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { patchMediaSource } = require('../my-medusa-store/scripts/patch-product-media.cjs')

function hook() {
  const module = { exports: {} }
  const js = ts.transpileModule(fs.readFileSync('my-medusa-store/src/admin/components/product-media-thumbnail.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, require: name => ({
    react: { useEffect: fn => fn(), forwardRef: fn => fn },
    '@medusajs/ui': { usePrompt: () => async () => true },
    '@medusajs/icons': {}, 'react/jsx-runtime': {},
  })[name] })
  return module.exports
}

test('delete/replace selects first available image once; reorders and manual choices remain selected', () => {
  const { useOwegMediaThumbnail, thumbnailIndex } = hook()
  let updates = 0
  const reconcile = media => { useOwegMediaThumbnail(media, (index, value) => { updates++; media[index] = value }); return media }
  const original = reconcile([{ id: 'a', isThumbnail: true }, { id: 'b', isThumbnail: false }])
  assert.equal(updates, 0)
  const remaining = reconcile(original.filter(image => image.id !== 'a'))
  assert.equal(remaining[0].isThumbnail, true)
  const replaced = reconcile([{ id: 'd' }, { id: 'e' }])
  assert.equal(replaced[0].isThumbnail, true)
  const count = updates
  const reordered = reconcile([replaced[1], replaced[0]])
  assert.equal(thumbnailIndex(reordered), 1)
  assert.equal(updates, count)
  const manual = reconcile([{ id: 'd', isThumbnail: false }, { id: 'e', isThumbnail: true }])
  assert.equal(thumbnailIndex(manual), 1)
  assert.equal(updates, count)
  reconcile([])
  assert.equal(updates, count)
})

test('thumbnail patch upgrades fresh and old upload-guard editors idempotently', () => {
  const fixture = `const handleDragStart = () => {};
  const handleSubmit = form.handleSubmit(async ({ media }) => {
    const filesToUpload = []; uploaded = uploads;
    const thumbnail = withUpdatedUrls.find((m) => m.isThumbnail)?.url;
  }); <ThumbnailBadge />`;
  const patched = patchMediaSource(fixture)
  assert.ok(patched.includes('owegUploadResultsComplete'))
  assert.ok(patched.includes('owegConfirmEmptyMedia'))
  assert.ok(patched.includes('OwegMediaThumbnailBadge'))
  assert.equal(patchMediaSource(patched), patched)
  const upgraded = patchMediaSource(fixture.replace('uploaded = uploads;', 'uploaded = uploads; const owegUploadResultsComplete = true;'))
  assert.ok(upgraded.includes('owegConfirmEmptyMedia'))
})
