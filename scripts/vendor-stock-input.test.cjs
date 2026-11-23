const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
test('invalid stock updates stop before inventory access, including an empty field', async () => {
  const source = fs.readFileSync('my-medusa-store/src/api/vendor/inventory/update/route.ts','utf8');
  const exports = {};
  let allowed = true;
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:1,target:9}}).outputText)(
    () => ({checkRateLimit:()=>({allowed,retryAfterSec:12}),requireApprovedVendor:async()=>({vendor_id:'seller'})}), exports);
  for (const quantity of ['', null, -1, 2.5, Infinity, Number.MAX_SAFE_INTEGER+1]) {
    const res = {setHeader(){}, status(n){this.code=n;return this},json(v){return v}};
    await exports.POST({body:{variant_id:'v',quantity}},res);
    assert.equal(res.code,400);
  }
  allowed = false;
  const res={setHeader(){},set(k,v){this[k]=v;return this},status(n){this.code=n;return this},json(v){return v}};
  await exports.POST({body:{variant_id:'v',quantity:10}},res);
  assert.equal(res.code,429);assert.equal(res['Retry-After'],'12');
});
