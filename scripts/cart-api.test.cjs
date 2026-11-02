const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { NextRequest } = require('next/server');

async function load(file) {
  const output = await esbuild.build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'qa',setup(b){
    b.onResolve({filter:/^(axios|next\/headers)$/},a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='axios'
      ? 'export default async function axios(config){return global.cartTest.upstream(config)}'
      : 'export async function cookies(){return {get:key=>global.cartTest.cookies[key]?{value:global.cartTest.cookies[key]}:undefined}}'}));
    b.onResolve({filter:/^@\//},a=>({path:path.resolve('src',a.path.slice(2)+'.ts')}));
  }}]});
  const mod=new Module(path.resolve(file)+'.qa.cjs',module);mod.filename=path.resolve(file)+'.qa.cjs';mod.paths=module.paths;
  mod._compile(output.outputFiles[0].text,mod.filename);return mod.exports;
}
async function main(){
  const originalFetch=global.fetch;
  global.cartTest={cookies:{cart_id:'cart_qa'},calls:[],upstream:()=>{throw Error('Unexpected upstream request')}};
  global.fetch=async(url,init={})=>{
    cartTest.calls.push({url:String(url),method:init.method||'GET'});
    if(String(url).endsWith('/store/flash-sale/products'))return Response.json({active:true,products:[{variant_id:'variant_a',flash_sale_price:149}]});
    if(init.method==='DELETE')return Response.json({id:'line_a',deleted:true,parent:{id:'cart_qa',items:[{id:'line_b',variant_id:'variant_a',quantity:2,unit_price:199}]}});
    if(init.method==='POST')return Response.json({cart:{id:'cart_qa',items:[{id:'line_a',variant_id:'variant_a',quantity:2,unit_price:199}]}});
    throw Error('Unexpected fetch '+url);
  };
  try{
    const get=await load('src/app/api/medusa/cart/route.ts');
    cartTest.upstream=()=>({status:503,statusText:'Unavailable',data:{error:'timeout'}});
    let r=await get.GET(new NextRequest('http://localhost/api/medusa/cart'));assert.equal(r.status,503);assert(!(await r.json()).cart);
    console.log('PASS: upstream cart failure is 503, never a fake empty cart or new cart');
    cartTest.upstream=()=>({status:404,data:{}});
    r=await get.GET(new NextRequest('http://localhost/api/medusa/cart'));assert.equal(r.status,200);assert.deepEqual((await r.json()).cart.items,[]);
    console.log('PASS: genuinely missing cart can render empty without creating one');
    cartTest.upstream=()=>({status:200,data:{cart:{id:'cart_qa',items:[{variant_id:'variant_a',quantity:1,unit_price:199}]}}});
    r=await get.GET(new NextRequest('http://localhost/api/medusa/cart'));assert.equal((await r.json()).cart.items[0].unit_price,149);assert.match(r.headers.get('cache-control'),/no-store/);
    const lines=await load('src/app/api/medusa/cart/line-items/[lineId]/route.ts');
    r=await lines.DELETE(new NextRequest('http://localhost/api/medusa/cart/line-items/line_a',{method:'DELETE'}),{params:Promise.resolve({lineId:'line_a'})});
    const removed=await r.json();assert.equal(r.status,200);assert.equal(removed.cart.id,'cart_qa');assert.equal(removed.cart.items.length,1);assert.equal(removed.cart.items[0].unit_price,149);
    console.log('PASS: Medusa delete parent becomes authoritative cart with flash pricing preserved');
    r=await lines.PATCH(new NextRequest('http://localhost/api/medusa/cart/line-items/line_a',{method:'PATCH',body:JSON.stringify({quantity:2})}),{params:{lineId:'line_a'}});
    assert.equal(r.status,200);assert.equal((await r.json()).cart.items[0].unit_price,149);
    console.log('PASS: quantity response and GET use identical flash-sale pricing');
    const before=cartTest.calls.length;
    for(const quantity of [0,-1,1.5,11]){
      r=await lines.PATCH(new NextRequest('http://localhost/api/medusa/cart/line-items/line_a',{method:'PATCH',body:JSON.stringify({quantity})}),{params:{lineId:'line_a'}});assert.equal(r.status,400);
    }
    assert.equal(cartTest.calls.length,before);
    console.log('PASS: invalid quantity is rejected before any backend write');
    cartTest.cookies={};
    r=await lines.PATCH(new NextRequest('http://localhost/api/medusa/cart/line-items/line_a',{method:'PATCH',headers:{'x-guest-cart-id':'cart_guest'},body:JSON.stringify({quantity:2})}),{params:{lineId:'line_a'}});
    assert.equal(r.status,200);assert(cartTest.calls.some(c=>c.url.includes('/carts/cart_guest/')));
    console.log('PASS: guest cart header still works without cookie');
    const add=await load('src/app/api/medusa/cart/line-items/route.ts');
    cartTest.cookies={cart_id:'cart_qa'};cartTest.upstreamCalls=[];
    cartTest.upstream=config=>{
      cartTest.upstreamCalls.push(config);
      if(config.url.includes('/catalog-offers'))return {status:200,data:{offers:[{variant_id:'variant_a',price:199,available:3}]}};
      if(config.method==='get')return {status:503,data:{error:'temporarily unavailable'}};
      throw Error('Unexpected write');
    };
    r=await add.POST(new NextRequest('http://localhost/api/medusa/cart/line-items',{method:'POST',body:JSON.stringify({variant_id:'variant_a',quantity:1,seller_selected:true})}));
    assert.equal(r.status,503);assert(!cartTest.upstreamCalls.some(c=>c.method==='post'));
    console.log('PASS: existing-cart read failure blocks add rather than bypassing aggregate stock checks');
    for(const quantity of [0,-1,1.5,11]){
      const before=cartTest.upstreamCalls.length;
      r=await add.POST(new NextRequest('http://localhost/api/medusa/cart/line-items',{method:'POST',body:JSON.stringify({variant_id:'variant_a',quantity})}));
      assert.equal(r.status,400);assert.equal(cartTest.upstreamCalls.length,before);
    }
    console.log('PASS: add rejects zero, negative, fractional and excessive quantities');
    cartTest.upstream=config=>{
      cartTest.upstreamCalls.push(config);
      if(config.url.includes('/catalog-offers'))return {status:200,data:{offers:[{variant_id:'variant_a',price:199,available:3}]}};
      if(config.method==='get')return {status:200,data:{cart:{id:'cart_qa',items:[]}}};
      assert.equal(config.data.variant_id,'variant_a');assert.deepEqual(config.data.metadata,{seller_selected:true});
      return {status:200,data:{cart:{id:'cart_qa',items:[{id:'line_a',variant_id:'variant_a',quantity:1,unit_price:199}]}}};
    };
    r=await add.POST(new NextRequest('http://localhost/api/medusa/cart/line-items',{method:'POST',body:JSON.stringify({variant_id:'variant_a',quantity:1,seller_selected:true})}));
    const added=await r.json();assert.equal(r.status,200);assert.equal(added.cart.items[0].unit_price,149);assert.equal(added.guestCartId,'cart_qa');assert.match(r.headers.get('set-cookie'),/cart_id=cart_qa/);
    console.log('PASS: pinned seller/variant, sale price and persisted identity survive add');
  }finally{global.fetch=originalFetch;delete global.cartTest;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
