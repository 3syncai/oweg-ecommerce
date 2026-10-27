const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const React = require('react')
const { act } = React

test('discovery loads at the scroll sentinel, stops on errors/end, and removes the count/button', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousWindow = global.window, previousDocument = global.document
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const observers = [], calls = []
  class Observer {
    constructor(callback) { this.callback = callback; this.closed = false; observers.push(this) }
    observe(element) { this.element = element }
    disconnect() { this.closed = true }
    emit(visible) { if (!this.closed) this.callback([{ isIntersecting: visible }]) }
  }
  dom.window.IntersectionObserver = Observer
  const query = {
    data: { pages: [{ products: [], nextOffset: 24 }] },
    hasNextPage: true, isFetching: false, isError: false, isPending: false,
    fetchNextPage: async options => calls.push(options),
  }
  const context = { exports: {}, window: dom.window, IntersectionObserver: Observer, require: name => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    if (name === '@tanstack/react-query') return { useInfiniteQuery: () => query }
    if (name === 'lucide-react') return { Loader2: () => null }
    if (name === '@/components/modules/ProductCard') return { ProductCard: () => null }
    if (name === './HomePage.module.css') return { default: {}, __esModule: true }
    throw new Error(`Unexpected import: ${name}`)
  } }
  const file = path.join(__dirname, '../src/app/home/HomeDiscovery.tsx')
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context)
  const { createRoot } = require('react-dom/client')
  const host = dom.window.document.createElement('div')
  dom.window.document.body.append(host)
  const root = createRoot(host)
  const render = () => root.render(React.createElement(context.exports.default, { excludeIds: [] }))
  try {
    await act(async () => render())
    assert.equal(calls.length, 0)
    await act(async () => observers[0].emit(true))
    const sentinel = observers.at(-1)
    await act(async () => sentinel.emit(false))
    assert.equal(calls.length, 0)
    await act(async () => sentinel.emit(true))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].cancelRefetch, false)
    assert.equal(host.textContent.includes('more finds to explore'), false)
    assert.equal(host.textContent.includes('Load more products'), false)
    query.isFetching = true
    await act(async () => render())
    assert.equal(sentinel.closed, true)
    query.isFetching = false; query.isError = true
    await act(async () => render())
    assert.equal(host.textContent.includes('Try again'), true)
    query.isError = false; query.hasNextPage = false
    await act(async () => render())
    assert.equal(observers.every(observer => observer.closed), true)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    global.window = previousWindow; global.document = previousDocument
    delete global.IS_REACT_ACT_ENVIRONMENT
  }
})
