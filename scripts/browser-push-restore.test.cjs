const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ installed = true, permission = 'granted', active = true, customer = 'customer-a' } = {}) {
  const calls = [];
  const subscription = { endpoint: 'https://push.example/device', toJSON: () => ({ endpoint: 'https://push.example/device', keys: {} }) };
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/lib/browser-push.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports,
    require: () => ({ isStandalonePwa: () => installed }),
    Notification: { permission, requestPermission: () => { throw Error('Unexpected permission prompt'); } },
    navigator: { serviceWorker: { getRegistration: async () => ({ active: true, pushManager: { getSubscription: async () => subscription } }) } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ configured: true, active, customer_id: customer, publicKey: 'AQ' }) };
    },
    AbortSignal, setTimeout, clearTimeout, atob,
  });
  return { api: mod.exports, calls };
}

test('background restore skips browser tabs and devices without granted permission', async () => {
  for (const options of [{ installed: false }, { permission: 'default' }, { permission: 'denied' }]) {
    const f = fixture(options);
    await f.api.restoreBrowserPush('customer-a');
    assert.equal(f.calls.length, 0);
  }
});

test('active installed-device subscription is verified without another permission prompt or write', async () => {
  const f = fixture();
  await f.api.restoreBrowserPush('customer-a');
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /\?endpoint=/);
  assert.equal(f.calls[0].options.method, undefined);
});

test('restore does not rebind a different customer session', async () => {
  const f = fixture({ active: false, customer: 'customer-b' });
  await f.api.restoreBrowserPush('customer-a');
  assert.equal(f.calls.length, 1);
});

test('inactive installed-device subscription is saved for the expected customer', async () => {
  const f = fixture({ active: false });
  await f.api.restoreBrowserPush('customer-a');
  const writes = f.calls.filter(c => c.options.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0].options.body).expected_customer_id, 'customer-a');
  assert.equal(JSON.parse(writes[0].options.body).installed_app, true);
});

test('aborted restore performs no network operation', async () => {
  const f = fixture();
  await assert.rejects(f.api.restoreBrowserPush('customer-a', AbortSignal.abort()), /cancelled/);
  assert.equal(f.calls.length, 0);
});
