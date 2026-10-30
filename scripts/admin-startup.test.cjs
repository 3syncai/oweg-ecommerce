const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { patchFeatureFlags } = require('../my-medusa-store/scripts/patch-admin-startup.cjs');

function load(file, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, AbortSignal, ...globals });
  return module.exports;
}
const clientFile = 'my-medusa-store/src/admin/lib/admin-access-client.ts';
test('background network failures retain verified UI briefly, but auth revocation and stale data block immediately', () => {
  const policy = load('my-medusa-store/src/admin/lib/admin-access-refresh.ts');
  for (const status of [undefined, 408, 429, 500, 502, 503]) {
    assert.equal(policy.accessRefreshFailure(status, true, 1000, 31_000), 'retain');
    assert.equal(policy.accessRefreshFailure(status, true, 1000, 91_000), 'block');
    assert.equal(policy.accessRefreshFailure(status, false, 0, 31_000), 'block');
  }
  for (const status of [401, 403]) assert.equal(policy.accessRefreshFailure(status, true, 1000, 1001), 'expired');
  assert.equal(policy.accessRefreshFailure(400, true, 1000, 1001), 'block');
  assert.deepEqual([1,2,3,4,20].map(policy.accessRetryDelay), [5000,10000,20000,30000,30000]);
});
test('a non-JSON unauthorized response preserves status and malformed success never grants access', async () => {
  const client = load(clientFile, { fetch: async () => ({ok:false,status:401,json:async()=>{throw new Error('HTML error');}}) });
  await assert.rejects(client.currentAdminAccess(), error => error.status === 401);
  const malformed = load(clientFile, { fetch: async () => ({ok:true,status:200,json:async()=>({access:{active:true}})}) });
  await assert.rejects(malformed.currentAdminAccess(), error => error.status === 502);
});
test('first login uses a role-neutral landing page and shows nonempty connection failures', () => {
  const { patchLogin } = require('../my-medusa-store/scripts/patch-admin-startup.cjs');
  const result = patchLogin('const from = location.state?.from?.pathname || "/orders"; const errorState = { message: error.message };');
  assert.ok(result.includes('|| "/my-access"'));
  assert.ok(result.includes('error.message || "Unable to connect'));
  assert.equal(patchLogin(result), result);
});
test('concurrent permission consumers share a request, but completed reads are never cached', async () => {
  let calls = 0, finish;
  const client = load(clientFile, { fetch: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = client.currentAdminAccess();
  const second = client.currentAdminAccess();
  assert.equal(calls, 1);
  finish({ ok: true, json: async () => ({ access: { user_id: 'first', permissions: [] } }) });
  assert.equal((await first).user_id, 'first');
  assert.equal((await second).user_id, 'first');
  const next = client.currentAdminAccess();
  assert.equal(calls, 2);
  finish({ ok: true, json: async () => ({ access: { user_id: 'first', permissions: [], active: false } }) });
  assert.equal((await next).active, false);
});
test('logout/login invalidates an in-flight read and an older completion cannot clear the new request', async () => {
  const pending = [];
  const client = load(clientFile, { fetch: () => new Promise(resolve => pending.push(resolve)) });
  const old = client.currentAdminAccess();
  client.resetAdminAccessRequest();
  const current = client.currentAdminAccess();
  pending[0]({ ok: true, json: async () => ({ access: { user_id: 'old', permissions: [] } }) });
  await old;
  assert.equal(client.currentAdminAccess(), current);
  assert.equal(pending.length, 2);
  pending[1]({ ok: true, json: async () => ({ access: { user_id: 'new', permissions: [] } }) });
  assert.equal((await current).user_id, 'new');
});
test('failed access checks fail closed, remain retryable and have a deadline', async () => {
  let calls = 0;
  const client = load(clientFile, { fetch: async (_url, options) => {
    calls++;
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'include');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: false, json: async () => ({ message: 'Sign in again' }) };
  } });
  await assert.rejects(client.currentAdminAccess(), /Sign in again/);
  await assert.rejects(client.currentAdminAccess(), /Sign in again/);
  assert.equal(calls, 2);
});
test('feature flags skip auth screens and become enabled on navigation without retrying 401s', () => {
  const fixture = `export const useFeatureFlags = () => useQuery({ queryKey: ["admin", "feature-flags"], queryFn: () => sdk.client.fetch("/admin/feature-flags", {\nmethod: "GET",\n}) });`;
  const patched = patchFeatureFlags(fixture);
  assert.equal(patchFeatureFlags(patched), patched);
  const listeners = new Map();
  const win = { location: { pathname: '/app/login' }, addEventListener: (event, cb) => listeners.set(event, cb), removeEventListener: event => listeners.delete(event) };
  const module = { exports: {} };
  const js = ts.transpileModule(patched, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, window: win, useQuery: options => options, require: () => ({ useSyncExternalStore: (subscribe, snapshot) => { subscribe(() => {}); return snapshot(); } }) });
  assert.equal(module.exports.useFeatureFlags().enabled, false);
  win.location.pathname = '/app/orders';
  const options = module.exports.useFeatureFlags();
  assert.equal(options.enabled, true);
  assert.equal(options.retry, false);
  assert.ok(listeners.has('oweg-admin-location'));
});
test('access/me reuses only the authenticated actor checked on this request', async () => {
  let calls = 0;
  const route = load('my-medusa-store/src/api/admin/access/me/route.ts', { require: name => name.includes('repository') ? {
    getAdminAccess: async id => { calls++; return { user_id: id }; }, publicAccess: value => value,
  } : { ADMIN_PERMISSION_GROUPS: [] } });
  let output;
  const res = { locals: { owegAdminAccess: { user_id: 'admin_a' } }, json: value => { output = value; } };
  await route.GET({ auth_context: { actor_id: 'admin_a' } }, res);
  assert.equal(calls, 0);
  res.locals.owegAdminAccess = { user_id: 'admin_b' };
  await route.GET({ auth_context: { actor_id: 'admin_a' } }, res);
  assert.equal(calls, 1);
  assert.equal(output.access.user_id, 'admin_a');
});
