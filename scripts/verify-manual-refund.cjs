/* Route contracts; isolated financial integration coverage lives in verify-payment-reliability. */
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const results=[];
async function invoke({actor={actor_id:'admin',actor_type:'user'},error,body={payout_reference:'UTR-1234',cash_minor:9500}}={}) {
 let calls=0,status=200,payload,input;
 const out={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('my-medusa-store/src/api/admin/return-requests/[id]/mark-refunded/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{Error,exports:out,require:n=>n.endsWith('/db-pool')?{getSharedDbPool:()=>({})}:{recordManualReturnRefund:async(_pool,data)=>{calls++;input=data;if(error)throw Error(error);return {return_id:data.returnId,cash_minor:data.cashMinor};}}});
 const res={status:n=>{status=n;return res;},json:value=>{payload=value;return res;}};
 await out.POST({auth_context:actor,params:{id:'return_test'},body},res);
 return {calls,status,payload,input};
}
async function test(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS:',name);}
(async()=>{
 await test('missing admin session cannot acknowledge payout',async()=>{const r=await invoke({actor:null});assert.equal(r.status,401);assert.equal(r.calls,0);});
 await test('customer actor cannot acknowledge payout',async()=>{const r=await invoke({actor:{actor_id:'customer',actor_type:'customer'}});assert.equal(r.status,401);assert.equal(r.calls,0);});
 await test('manual acknowledgement includes admin, exact amount and payout reference',async()=>{const r=await invoke();assert.equal(r.status,200);assert.equal(r.input.actorId,'admin');assert.equal(r.input.cashMinor,9500);assert.equal(r.input.payoutReference,'UTR-1234');assert.equal(r.payload.synchronization_queued,true);});
 await test('invalid state or changed quote returns conflict',async()=>{const r=await invoke({error:'refund_quote_changed'});assert.equal(r.status,409);});
 await test('database failure explains safe retry without repeating bank payout',async()=>{const r=await invoke({error:'database_down'});assert.equal(r.status,503);assert.match(r.payload.message,/do not transfer money again/);});
 fs.writeFileSync('docs/manual-refund-qa-last-run.json',JSON.stringify({ranAt:new Date().toISOString(),scope:'route contracts; PostgreSQL settlement and concurrency covered separately; no bank payout performed',results},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
