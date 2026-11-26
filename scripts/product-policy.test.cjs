const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), ts=require('typescript');
const api={};
new Function('exports',ts.transpileModule(fs.readFileSync('my-medusa-store/src/lib/vendor-return-policy.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText)(api);
test('storefront only advertises configured days and matches order eligibility for the selected product',async()=>{
  const policies=[['a',0,0],['b',0,7],['c',14,3]];
  const pool={query:async(sql,args)=>({rows:args ? policies.filter(([id])=>args[0].includes(id)).map(([id,r,s])=>({id,parent_category_id:null,return_window_days:r,replacement_window_days:s})) : []})};
  for(const [id,r,s] of policies){
    const expected={return_window_days:r,replacement_window_days:s};
    assert.deepEqual(await api.configuredReturnPolicyForProduct(pool,[id]),expected);
    assert.deepEqual(await api.resolveReturnPolicyForProduct(pool,[id]),expected);
  }
  assert.equal(await api.configuredReturnPolicyForProduct(pool,['legacy']),null);
  assert.deepEqual(await api.resolveReturnPolicyForProduct(pool,['legacy']),{return_window_days:7,replacement_window_days:7});
});
