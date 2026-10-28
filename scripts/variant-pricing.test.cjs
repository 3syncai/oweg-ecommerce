const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,imports={}){const ctx={exports:{},console,Date,require:name=>{if(name in imports)return imports[name];throw Error(`Unexpected import: ${name}`)}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,ctx);return ctx.exports}
const backend=load('my-medusa-store/src/lib/variant-pricing.ts');const frontend=load('vendor-portal/lib/variant-pricing.ts');
for(const [name,policy] of [['frontend',frontend],['backend',backend]]){
 test(`${name}: corrected size rows are valid, including equal MRP/sale and no discount`,()=>{
 assert.equal(policy.variantPricesError([{title:'3 Litre',sku:'12642',price:1990,discounted_price:1130},{title:'5 Litre',sku:'12644',price:2549,discounted_price:1545}]),null);
 assert.equal(policy.variantPricesError([{price:100,discounted_price:100},{price:100,discounted_price:''}]),null);
 });
 test(`${name}: validates every size and identifies the bad SKU`,()=>{
 const error=policy.variantPricesError([{price:1990,discounted_price:1130},{title:'5 Litre',sku:'12644',price:2,discounted_price:1545}]);assert.match(error,/5 Litre.*12644/);assert.match(error,/1545.*2/);
 });
 test(`${name}: rejects invalid amounts without imposing a made-up minimum price`,()=>{
 for(const price of [undefined,'',0,-1,NaN,Infinity,'123garbage'])assert.ok(policy.variantPricesError([{price}]));
 for(const discounted_price of [-1,0,NaN,Infinity,'12garbage'])assert.ok(policy.variantPricesError([{price:100,discounted_price}]));
 assert.equal(policy.variantPricesError([{price:1,discounted_price:1}]),null);
 });
}
test('legacy matrix edits delegate to the atomic product save with authorization and locking',async()=>{
 const calls=[];
 const req={scope:{},body:{variants:[{id:'v3',price:1990,discounted_price:1130}]}};
 const res={setHeader(){}};
 const auth={vendor_id:'vendor'};
 const route=load('my-medusa-store/src/api/vendor/products/[id]/variants/route.ts',{
 '../../../_lib/guards':{requireApprovedVendor:async()=>auth},
 '../../../../../lib/catalog-identity':{withCatalogLock:(scope,fn)=>{assert.equal(scope,req.scope);calls.push('lock');return fn()}},
 '../route':{OPTIONS:()=>{},updateOffer:async(r,s,a,legacy)=>{assert.equal(r,req);assert.equal(s,res);assert.equal(a,auth);assert.equal(legacy,true);calls.push('save');return 'saved'}},
 });
 assert.equal(await route.PATCH(req,res),'saved');
 assert.deepEqual(calls,['lock','save']);
});
