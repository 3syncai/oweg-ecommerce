import assert from 'node:assert/strict'
import test from 'node:test'
import { categoryFromSourceTag } from './source-category.ts'

test('homepage category context resolves to a category handle', () => {
  assert.deepEqual(categoryFromSourceTag('category:kitchen-appliances'), { handle: 'kitchen-appliances' })
})

test('homepage category context supports categories without a handle', () => {
  assert.deepEqual(categoryFromSourceTag('category:pcat_123'), { id: 'pcat_123' })
})

test('regular product tags remain tags', () => {
  assert.equal(categoryFromSourceTag('popular'), undefined)
  assert.equal(categoryFromSourceTag('flash-sale'), undefined)
})

test('missing or empty category context creates no category request', () => {
  assert.equal(categoryFromSourceTag(), undefined)
  assert.equal(categoryFromSourceTag('category:  '), undefined)
})
