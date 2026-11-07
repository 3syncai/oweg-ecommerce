const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('src/lib/checkout-order-request.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsForTest = {};
vm.runInNewContext(output, {exports:exportsForTest,setTimeout,clearTimeout,fetch,AbortController});
const {fetchCheckoutOrder} = exportsForTest;
const abortingRequest = async (_, {signal}) => new Promise((resolve,reject) => { signal.addEventListener('abort',()=>reject(new DOMException('signal is aborted without reason','AbortError')),{once:true}); });
test('successful summary uses the right read-only endpoint and returns the order',async()=>{
 let called; const result=await fetchCheckoutOrder('order /fixture',false,new AbortController(),async(url,init)=>{called={url,init};return new Response('{"order":{"id":"order_fixture"}}')});
 assert.equal(result.order.id,'order_fixture');assert.match(called.url,/order-summary\?orderId=order%20%2Ffixture$/);assert.equal(called.init.cache,'no-store');
});
test('unmount/Strict Mode cancellation is returned without a rejected promise',async()=>{
 const controller=new AbortController(),pending=fetchCheckoutOrder('order_fixture',false,controller,abortingRequest);
 controller.abort();const result=await pending;assert.equal(result.cancelled,true);assert.equal(result.timedOut,false);assert.equal(result.notFound,false);
});
test('deadline expiry is a retryable read outcome rather than a missing order',async()=>{
 const result=await fetchCheckoutOrder('order_fixture',true,new AbortController(),abortingRequest,5);
 assert.equal(result.timedOut,true);assert.equal(result.cancelled,false);assert.equal(result.notFound,false);assert.equal(result.order,null);
});
test('a pre-aborted request never reaches the transport',async()=>{
 const controller=new AbortController();controller.abort();
 const result=await fetchCheckoutOrder('order_fixture',true,controller,()=>{throw Error('must not fetch')});assert.equal(result.cancelled,true);
});
test('cancelled transport response cannot replace the current order',async()=>{
 const controller=new AbortController();const result=await fetchCheckoutOrder('old_order',true,controller,async()=>{controller.abort();return new Response('{"order":{"id":"old_order"}}')});assert.equal(result.cancelled,true);assert.equal(result.order,null);
});
test('authentication, missing order and upstream failures stay distinct',async()=>{
 for(const status of [401,404,503]){const result=await fetchCheckoutOrder('order_fixture',true,new AbortController(),async()=>new Response(null,{status}));assert.equal(result.notFound,status===404);assert.equal(!!result.authRequired,status===401)}
});
test('unexpected network errors remain visible to the caller',async()=>{
 await assert.rejects(fetchCheckoutOrder('order_fixture',true,new AbortController(),async()=>{throw new Error('network unavailable')}),/network unavailable/);
});
