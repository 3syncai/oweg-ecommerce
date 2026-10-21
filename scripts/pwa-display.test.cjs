const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const { renderToString } = require('react-dom/server')

const filename = path.resolve(__dirname, '../src/hooks/useStandaloneDisplay.ts')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename)
const { useStandaloneDisplay } = loaded.exports
const Harness = () => React.createElement('output', null, String(useStandaloneDisplay()))

test('server rendering works without a window and starts with the browser layout', () => {
  assert.equal(renderToString(React.createElement(Harness)), '<output>false</output>')
})

test('installed display changes and iOS standalone are detected, with subscriptions cleaned up', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>')
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  let installed = false
  const listeners = new Set()
  window.matchMedia = () => ({
    get matches() { return installed },
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  })
  const { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const value = () => document.querySelector('output').textContent
  try {
    await React.act(async () => root.render(React.createElement(Harness)))
    assert.equal(value(), 'false')
    await React.act(async () => { installed = true; listeners.forEach(fn => fn()) })
    assert.equal(value(), 'true')
    await React.act(async () => { installed = false; listeners.forEach(fn => fn()) })
    assert.equal(value(), 'false')
    await React.act(async () => {
      Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
      window.dispatchEvent(new window.Event('pageshow'))
    })
    assert.equal(value(), 'true')
    await React.act(async () => root.unmount())
    assert.equal(listeners.size, 0)
  } finally {
    dom.window.close()
    delete global.window
    delete global.document
  }
})
