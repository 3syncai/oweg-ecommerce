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
function setup(){let synced=0,updated=0;const old=[{id:'v3',title:'3 Litre',sku:'12642',price:1,discounted_price:1130},{id:'v5',title:'5 Litre',sku:'12644',price:2,discounted_price:1545}];
 const matrix={options:[{title:'Size',values:['3 Litre','5 Litre']}],variants:old};
 const route=load('my-medusa-store/src/api/vendor/products/[id]/variants/route.ts',{
 '../../../../../lib/catalog-identity':{CatalogConflict:class extends Error{},protectCatalogEdit:async()=>{},publicVariantSku:(_p,v)=>v.sku,withCatalogLock:(_scope,fn)=>fn()},
 '../../../../../lib/variant-pricing':backend,
 '../../../_lib/guards':{requireApprovedVendor:async()=>({vendor_id:'vendor'})},
 '@medusajs/framework/utils':{Modules:{PRODUCT:'product',PRICING:'pricing'},ProductStatus:{DRAFT:'draft'}},
 '../../../../../lib/variant-matrix':{detectVisualOption:()=>undefined,sanitizeColorImages:()=>({})},
 '../../../../../lib/vendor-product-variants':{fetchProductVariantMatrix:async()=>matrix,syncVariantInventoryLevels:async()=>{},syncVendorProductOptionsAndVariants:async()=>{synced++},syncVariantThumbnailsFromColorImages:async()=>{}},
 });
 const scope={resolve:name=>name==='product'?{retrieveProduct:async()=>({metadata:{vendor_id:'vendor'}}),updateProducts:async()=>{updated++}}:{}};
 const res={code:200,body:null,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 return {route,scope,res,counts:()=>({synced,updated})};
}
test('matrix edit accepts corrected row prices despite invalid saved summary prices',async()=>{
 const s=setup();await s.route.PATCH({params:{id:'product'},scope:s.scope,body:{options:[{title:'Size',values:['3 Litre','5 Litre']}],variants:[{id:'v3',title:'3 Litre',sku:'12642',price:1990,discounted_price:1130},{id:'v5',title:'5 Litre',sku:'12644',price:2549,discounted_price:1545}]}},s.res);
 assert.equal(s.res.code,200);assert.deepEqual(s.counts(),{synced:1,updated:1});
});
test('matrix edit rejects invalid later row before any row or product is written',async()=>{
 const s=setup();await s.route.PATCH({params:{id:'product'},scope:s.scope,body:{options:[{title:'Size',values:['3 Litre','5 Litre']}],variants:[{id:'v3',price:1990,discounted_price:1130},{id:'v5',price:2,discounted_price:1545}]}},s.res);
 assert.equal(s.res.code,400);assert.match(s.res.body.message,/12644/);assert.deepEqual(s.counts(),{synced:0,updated:0});
});
test('partial sale-only update is compared against saved MRP before writes',async()=>{
 const s=setup();await s.route.PATCH({params:{id:'product'},scope:s.scope,body:{variants:[{id:'v3',discounted_price:1130}]}},s.res);
 assert.equal(s.res.code,400);assert.deepEqual(s.counts(),{synced:0,updated:0});
});
