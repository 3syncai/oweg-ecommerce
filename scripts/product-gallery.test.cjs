const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const React = require('react')
const { act } = React

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')

// Render the real gallery with lightweight image, icon and CSS adapters.
const filename = path.resolve(__dirname, '../src/app/productDetail/components/ProductGallery.tsx')
const galleryModule = new Module(filename, module)
galleryModule.filename = filename
galleryModule.paths = Module._nodeModulePaths(path.dirname(filename))
galleryModule.require = (name) => {
  if (name === 'next/image') return { __esModule: true, default: ({ fill: _fill, priority: _priority, ...props }) => React.createElement('img', props) }
  if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', props) })
  if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
  if (name === '@/lib/image-utils') return { getImageUrlForNewTab: value => value }
  return module.require(name)
}
galleryModule._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename)
const Gallery = galleryModule.exports.default

async function mount(images = ['/one.jpg', '/two.jpg', '/three.jpg']) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    const [selectedIndex, onSelect] = React.useState(0)
    return React.createElement(Gallery, { images, selectedIndex, onSelect, fallback: '/fallback.jpg', productTitle: 'Pressure cooker' })
  }
  await act(async () => root.render(React.createElement(Harness)))
  return {
    host,
    button: name => host.querySelector(`[aria-label="${name}"]`),
    image: () => host.querySelector('img[alt="Selected product image"]').getAttribute('src'),
    close: async () => { await act(async () => root.unmount()); host.remove() },
  }
}

async function touch(target, start, end = start) {
  const dispatch = (type, point) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      touches: { value: type === 'touchstart' ? [{ clientX: point[0], clientY: point[1] }] : [] },
      changedTouches: { value: [{ clientX: point[0], clientY: point[1] }] },
    })
    target.dispatchEvent(event)
  }
  await act(async () => dispatch('touchstart', start))
  await act(async () => dispatch('touchend', end))
}
async function tap(target) {
  await touch(target, [100, 100])
  await act(async () => target.click())
}

test('touching navigation arrows changes one image without opening the lightbox, including wraparound', async () => {
  const g = await mount()
  try {
    for (const expected of ['/two.jpg', '/three.jpg', '/one.jpg']) {
      await tap(g.button('Next product image'))
      assert.equal(g.image(), expected)
      assert.equal(Boolean(document.querySelector('[role="dialog"]')), false)
    }
    await tap(g.button('Previous product image'))
    assert.equal(g.image(), '/three.jpg')
    assert.equal(Boolean(document.querySelector('[role="dialog"]')), false)
  } finally { await g.close() }
})

test('image swipe navigates while a vertical scroll does not navigate or open a lightbox', async () => {
  const g = await mount()
  try {
    const image = g.button('View product image gallery')
    await touch(image, [200, 100], [80, 110])
    assert.equal(g.image(), '/two.jpg')
    assert.equal(Boolean(document.querySelector('[role="dialog"]')), false)
    await touch(image, [100, 100], [110, 240])
    assert.equal(g.image(), '/two.jpg')
    assert.equal(Boolean(document.querySelector('[role="dialog"]')), false)
  } finally { await g.close() }
})

test('tapping the image still opens the lightbox, and single-image products have no arrows', async () => {
  const g = await mount(['/one.jpg'])
  try {
    assert.equal(g.button('Next product image'), null)
    assert.equal(g.button('Previous product image'), null)
    await tap(g.button('View product image gallery'))
    assert.ok(document.querySelector('[role="dialog"]'))
  } finally { await g.close() }
})

test('thumbnail taps select the correct image without opening the lightbox', async () => {
  const g = await mount()
  try {
    await tap(g.button('Select product image 3'))
    assert.equal(g.image(), '/three.jpg')
    assert.equal(Boolean(document.querySelector('[role="dialog"]')), false)
  } finally { await g.close() }
})
