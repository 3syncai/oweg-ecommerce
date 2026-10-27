const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  let config;
  let activate;
  const deletedCaches = [];
  const deletedRequests = [];
  const api = { url: 'https://shop.test/api/medusa/orders' };
  const image = { url: 'https://shop.test/image.png' };
  class NetworkOnly {}
  const context = {
    exports: {}, URL,
    require: (name) => {
      if (name === '@serwist/next/worker') return { defaultCache: [{ matcher: () => true }] };
      if (name === 'serwist') return {
        NetworkOnly,
        Serwist: class {
          constructor(options) { config = options; }
          addEventListeners() {}
        },
      };
      throw new Error(name);
    },
    self: { addEventListener: (name, handler) => { if (name === 'activate') activate = handler; } },
    caches: {
      keys: async () => ['oweg-api', 'apis', 'images'],
      delete: async (name) => deletedCaches.push(name),
      open: async () => ({
        keys: async () => [api, image],
        delete: async (request) => deletedRequests.push(request.url),
      }),
    },
  };
  const source = fs.readFileSync('src/sw.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(compiled.outputText, context);
  const rule = config.runtimeCaching[0];
  assert.ok(rule.handler instanceof NetworkOnly);
  for (const path of ['/api', '/api/medusa/orders', '/api/medusa/auth/session']) {
    assert.equal(rule.matcher({ url: new URL(path, 'https://shop.test') }), true);
  }
  assert.equal(rule.matcher({ url: new URL('https://shop.test/image.png') }), false);
  let cleanup;
  activate({ waitUntil: (promise) => { cleanup = promise; } });
  await cleanup;
  assert.deepEqual(deletedCaches, ['oweg-api']);
  assert.equal(deletedRequests.length, 2);
  assert.ok(deletedRequests.every(url => url === api.url));
  console.log('Service worker API bypass and legacy cache cleanup passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
