const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, imports = {}) {
  const context = { exports: {}, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText, context)
  return context.exports
}
const browser = load('src/lib/password-policy.ts')
const backend = load('my-medusa-store/src/lib/password-reset/password-policy.ts')
test('backend request schema accepts short passwords without relaxing token validation', () => {
  const { StoreResetPassword } = load('my-medusa-store/src/api/store/customers/validators.ts', {
    zod: require('../my-medusa-store/node_modules/zod'),
    '@medusajs/medusa/dist/api/store/customers/validators': {},
  })
  assert.equal(StoreResetPassword.safeParse({ token: 'x'.repeat(40), password: 'A1!' }).success, true)
  assert.equal(StoreResetPassword.safeParse({ token: 'short', password: 'A1!' }).success, false)
  assert.equal(StoreResetPassword.safeParse({ token: 'x'.repeat(40), password: '' }).success, false)
})
for (const [name, policy] of [['frontend', browser], ['backend', backend]]) {
  test(`${name}: short passwords need only a capital, number and special character`, () => {
    for (const password of ['A1!', 'OWEG@2026', 'Hello1!']) assert.equal(policy.validateStrongPassword(password), null)
  })
  test(`${name}: each of the three requirements is enforced and spaces are not special characters`, () => {
    for (const password of ['', 'a1!', 'Abc!', 'ABC123', 'A1 ', 'Abc123\t']) {
      assert.equal(policy.validateStrongPassword(password), policy.PASSWORD_POLICY_MESSAGE)
    }
  })
}

function proxy() {
  const calls = []
  const api = load('src/app/api/medusa/customers/reset-password/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '@/lib/password-policy': browser,
    '@/lib/medusa-auth': {
      extractErrorPayload: async response => response.json(),
      medusaStoreFetch: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) })
        return { ok: true, json: async () => ({ message: 'Password updated' }) }
      },
    },
  })
  return { calls, post: (password, token = 'test-only-token') => api.POST({
    json: async () => ({ password, token }), headers: { get: () => null },
  }) }
}
test('API proxy accepts the same short password as frontend and backend', async () => {
  const api = proxy()
  assert.equal((await api.post('A1!')).status, 200)
  assert.equal(api.calls[0].body.password, 'A1!')
})
test('API proxy rejects missing character requirements before contacting backend', async () => {
  const api = proxy()
  for (const password of ['Abc!', 'a1!', 'ABC123', null, 123]) assert.equal((await api.post(password)).status, 400)
  assert.equal(api.calls.length, 0)
})
test('missing reset tokens still block password changes', async () => {
  const api = proxy()
  assert.equal((await api.post('A1!', '')).status, 400)
  assert.equal(api.calls.length, 0)
})
