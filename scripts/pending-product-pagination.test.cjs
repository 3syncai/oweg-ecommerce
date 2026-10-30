const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,requireFn=()=>({})) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,{module,exports:module.exports,require:requireFn,console:{error:()=>{}}});
 return module.exports;
}
const helper=load('my-medusa-store/src/lib/pending-product-pagination.ts');
test('pagination defaults, hard cap and hostile/non-integer query inputs',()=>{
 assert.equal(helper.pendingProductPagination({}).limit,25);
 assert.equal(helper.pendingProductPagination({limit:'100',offset:'50'}).offset,50);
 for(const input of [{limit:'0'},{limit:'101'},{limit:'-1'},{offset:'-1'},{limit:['25']},{offset:{}},{offset:'1.5'},{limit:'25 OR 1=1'},{offset:'999999999999999999999999'}]) assert.throws(()=>helper.pendingProductPagination(input));
});
test('last-item approval/removal clamps to a populated page, including an empty queue',()=>{
 assert.equal(helper.pendingProductOffset(51,25,50),50);
 assert.equal(helper.pendingProductOffset(50,25,50),25);
 assert.equal(helper.pendingProductOffset(0,25,50),0);
 assert.equal(helper.pendingProductOffset(100,25,25),25);
});
function fixture({count=61,removed=false}={}){
 const catalog=Array.from({length:count},(_,i)=>({id:`prod_${String(i).padStart(4,'0')}`,metadata:{approval_status:'pending',vendor_id:`vendor_${i%2}`}}));
 let graphCalls=0,vendorCalls=0,requestedIds;
 const pool={query:async(sql,args)=>{
  assert.match(sql,/deleted_at IS NULL/);
  assert.match(sql,/metadata->>'approval_status' = \$1/);
  assert.equal(args[0],'pending');
  if(sql.includes('count(*)')) return{rows:[{count:catalog.length}]};
  assert.match(sql,/ORDER BY created_at DESC, id DESC LIMIT \$2 OFFSET \$3/);
  return{rows:catalog.slice(args[2],args[2]+args[1]).map(p=>({id:p.id}))};
 }};
 const query={graph:async(options)=>{
  graphCalls++;requestedIds=options.filters.id;
  assert.ok(requestedIds.length<=options.pagination.take);
  const selected=catalog.filter(p=>requestedIds.includes(p.id)).reverse();
  return{data:removed?selected.map(p=>({...p,metadata:{...p.metadata,approval_status:'approved'}})):selected};
 }};
 const vendor={listVendors:async(filter,config)=>{
  vendorCalls++; assert.ok(Array.isArray(filter.id));assert.ok(filter.id.length<=2);assert.equal(config.take,filter.id.length);
  return filter.id.filter(id=>id!=='vendor_1').map(id=>({id,name:'Store',email:'vendor@example.test'}));
 }};
 const route=load('my-medusa-store/src/api/admin/custom/vendor-products/pending/route.ts',name=>name.includes('db-pool')?{getSharedDbPool:()=>pool}:name.includes('pending-product-pagination')?helper:{VENDOR_MODULE:'vendor'});
 const request=async(input)=>{
  let status=200,body;const res={setHeader:()=>{},status:value=>{status=value;return res;},json:value=>{body=value;return value;}};
  await route.GET({query:input,scope:{resolve:name=>name==='query'?query:vendor}},res);
  return{status,body};
 };
 return{request,stats:()=>({graphCalls,vendorCalls,requestedIds})};
}
test('large queues fetch only page IDs, preserve SQL order and scope vendor enrichment',async()=>{
 const f=fixture({count:1001});
 const first=await f.request({limit:'25',offset:'0'});
 assert.equal(first.status,200);assert.equal(first.body.count,1001);assert.equal(first.body.products.length,25);
 assert.equal(first.body.products[0].id,'prod_0000');assert.equal(first.body.products[1].vendor,null);
 const next=await f.request({limit:'25',offset:'25'});
 assert.equal(next.body.products[0].id,'prod_0025');
 assert.equal(next.body.products.some(p=>first.body.products.some(previous=>previous.id===p.id)),false);
 assert.equal(f.stats().requestedIds.length,25);
});
test('empty/out-of-range pages keep total and skip product/vendor graph work',async()=>{
 const f=fixture({count:2});const r=await f.request({offset:'25'});
 assert.equal(r.body.count,2);assert.equal(r.body.products.length,0);assert.equal(f.stats().graphCalls,0);assert.equal(f.stats().vendorCalls,0);
 const empty=await fixture({count:0}).request({});assert.equal(empty.body.count,0);
});
test('invalid paging cannot trigger catalog reads, and concurrently approved products are excluded',async()=>{
 const f=fixture();const bad=await f.request({limit:'1000'});assert.equal(bad.status,400);assert.equal(f.stats().graphCalls,0);
 const removed=fixture({removed:true});const result=await removed.request({});assert.equal(result.body.products.length,0);assert.equal(removed.stats().vendorCalls,0);
});
