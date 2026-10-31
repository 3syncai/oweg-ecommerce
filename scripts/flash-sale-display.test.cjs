const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function load(file, mocks = {}) {
  const module = { exports: {} }
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, Date, URL, URLSearchParams, console: {log(){},warn(){},error(){}}, process: {env:{MEDUSA_BACKEND_URL:'https://backend.example'}},
    require: name => name in mocks ? mocks[name] : require(name) }, { filename: file })
  return module.exports
}
const display = load('src/lib/flash-sale-display.ts')

test('deal display selects the cheapest stocked size and keeps that size MRP paired', () => {
  const {lowestFlashSalePricing} = load('src/lib/home-flash-sale.ts', {'./medusa':{}})
  const variants = [{id:'large',price:1500,mrp:2200,inventory_quantity:2},
    {id:'small',price:1090,mrp:1800,inventory_quantity:4},
    {id:'empty',price:10,mrp:3000,inventory_quantity:0}]
  const quote = lowestFlashSalePricing(variants,'large',1400)
  assert.equal(quote.variant_id,'small')
  assert.equal(quote.price,1090)
  assert.equal(quote.mrp,1800)
  assert.equal(quote.from,true)
  const sale = lowestFlashSalePricing(variants,'large','900.00')
  assert.equal(sale.price,900)
  assert.equal(sale.mrp,2200)
  assert.equal(variants[0].price,1500)
  assert.equal(lowestFlashSalePricing([variants[2]],'empty',5),undefined)
})
test('countdown splits 24+ hours into days and never shows invalid or negative numbers', () => {
  for (const [ms, expected] of [[(49*3600+125)*1000, [2,1,2,5]], [86400000,[1,0,0,0]], [86399000,[0,23,59,59]], [0,[0,0,0,0]],[-1,[0,0,0,0]],[NaN,[0,0,0,0]]]) {
    assert.deepEqual(Object.values(display.flashSaleCountdown(ms)), expected)
  }
  assert.deepEqual(Array.from(display.flashSaleTimerUnits(display.flashSaleCountdown(90000000)), u=>u.label), ['Days','Hours','Minutes','Seconds'])
  assert.equal(display.flashSaleTimerUnits(display.flashSaleCountdown(3600000)).length, 3)
})
const sale = { active:true, flash_sale:{ title:'  Weekend Kitchen Deals  ', expires_at:'2099-01-01',item_count:73,time_remaining_ms:90000000 },
  products:Array.from({length:73},(_,i)=>({id:'product-'+i,title:'Product '+i,thumbnail:'/placeholder-product.png',variant_id:'variant-'+i,flash_sale_price:'900.00',original_price:'1000.00'})) }
const showcase = load('src/components/flash-sale/FlashSaleSection.tsx', {
  'lucide-react':{ChevronLeft:()=>null,ChevronRight:()=>null,Zap:()=>null,ArrowRight:()=>null,Heart:()=>null,ImageOff:()=>null},
  '@/lib/flash-sale-display':display,
  'next/link':({children,href,...props})=>React.createElement('a',{...props,href,prefetch:undefined},children),
  'next/image':({src,alt})=>React.createElement('img',{src,alt}),
  '@/contexts/AuthProvider':{useAuth:()=>({customer:null})},
  '@/hooks/useWishlistMutations':{useAddToWishlistWithNotification:()=>({addToWishlist:()=>{},isLoading:false})},
  '@/components/modules/ProductCardQuickActions':{ProductCardQuickActions:({variantId})=>React.createElement('button',{'data-variant':variantId},'Add to Cart')},
  './FlashSaleSection.module.css':new Proxy({}, {get:(_,key)=>String(key)}),
})
test('homepage uses the admin title, a real all-deals link and a four-part long countdown', () => {
  const html=renderToStaticMarkup(React.createElement(showcase.FlashSaleShowcase,{data:sale,timeRemaining:display.flashSaleCountdown(90000000)}))
  assert.match(html, /<h2>Weekend Kitchen Deals<\/h2>/)
  assert.match(html, /href="\/flash-sale"/)
  assert.match(html, /<span>Days<\/span>/)
  assert.match(html, /1 days, 1 hours, 0 minutes, 0 seconds remaining/)
  assert.match(html, /data-variant="variant-0"/)
  assert.match(html, /10% OFF/)
})
test('all-deals view renders every card in a grid with existing prices and variant actions', () => {
  const html=renderToStaticMarkup(React.createElement(showcase.FlashSaleShowcase,{data:sale,timeRemaining:display.flashSaleCountdown(3600000),view:'all'}))
  assert.equal((html.match(/<article/g)||[]).length,73)
  assert.match(html, /aria-label="All flash sale products"/)
  assert.match(html, /<h1>Weekend Kitchen Deals<\/h1>/)
  assert.match(html, /data-variant="variant-72"/)
  assert.doesNotMatch(html, /Scroll flash sale|<span>Days<\/span>/)
})
test('legacy titles fall back and HTML in a title remains escaped text', () => {
  assert.equal(display.flashSaleTitle(null),'Deal of the Day')
  const html=renderToStaticMarkup(React.createElement(showcase.FlashSaleShowcase,{data:{...sale,products:[],flash_sale:{...sale.flash_sale,title:'<script>bad</script>'}},timeRemaining:display.flashSaleCountdown(1000)}))
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})
test('full stock checks span multiple bounded lookups, while homepage remains capped', async () => {
  const batches=[]
  const {inStockHomeFlashSale}=load('src/lib/home-flash-sale.ts',{'./medusa':{fetchProductsByIds:async ids=>{batches.push(ids);return ids.map(id=>({variants:[{id:'v-'+id,inventory_quantity:id==='p-70'?0:2}]}))}}})
  const products=Array.from({length:133},(_,i)=>({id:'p-'+i,variant_id:'v-p-'+i,flash_sale_price:100}))
  const all=await inStockHomeFlashSale({active:true,products,flash_sale:{title:'Real title'}},{all:true})
  assert.deepEqual(batches.map(b=>b.length),[60,60,13])
  assert.equal(all.products.length,132)
  assert.equal(all.products.at(-1).id,'p-132')
  assert.equal(all.products.some(p=>p.id==='p-70'),false)
  assert.equal(all.flash_sale.title,'Real title')
  batches.length=0
  assert.equal((await inStockHomeFlashSale({active:true,products})).products.length,60)
})
const titleRules=load('my-medusa-store/src/lib/flash-sale-title.ts')
test('campaign title is trimmed, optional and bounded before persistence', () => {
  assert.equal(titleRules.normalizeFlashSaleTitle(' Summer sale '),'Summer sale')
  assert.equal(titleRules.normalizeFlashSaleTitle('  '),null)
  assert.equal(titleRules.normalizeFlashSaleTitle(undefined),null)
  assert.throws(()=>titleRules.normalizeFlashSaleTitle(123),/must be text/)
  assert.throws(()=>titleRules.normalizeFlashSaleTitle('x'.repeat(121)),/120/)
})
test('batch persistence retains the campaign title and complete listing reads paginate', async () => {
  const {default:Service}=load('my-medusa-store/src/modules/flash-sale/service.ts',{
    '@medusajs/framework/utils':{MedusaService:()=>class {async createFlashSaleItems(items){return items}},
      MedusaError:class extends Error{},Modules:{}},
    './models/flash-sale-item':{},'../../lib/flash-sale-title':titleRules,
  })
  const service=new Service()
  const rows=await service.createFlashSaleItemsBatch([{product_id:'p',variant_id:'v',flash_sale_price:90,original_price:100,expires_at:'2099-01-01',title:' Summer '}])
  assert.equal(rows[0].title,'Summer')
  assert.equal(rows[0].flash_sale_price,90)
  const calls=[]
  service.listFlashSaleItems=async(_,config)=>{calls.push(config);return Array.from({length:235},(_,id)=>({id})).slice(config.skip,config.skip+config.take)}
  assert.equal((await service.getAllFlashSaleItems()).length,235)
  assert.deepEqual(calls.map(c=>c.skip),[0,100,200])
})
test('migration adds an optional field without rewriting or deleting existing sale data', () => {
  const migration=fs.readFileSync(path.join('my-medusa-store/src/modules/flash-sale/migrations/Migration20261031120000.ts'),'utf8')
  const up=migration.split('async down')[0]
  assert.match(up,/add column if not exists "title" text null/)
  assert.doesNotMatch(up,/drop|delete|update /i)
})
test('admin save forwards its validated title without changing prices or variants', async () => {
  let saved
  const route=load('my-medusa-store/src/api/admin/flash-sale/route.ts',{
    '@medusajs/framework/utils':{Modules:{PRODUCT:'product'}},pg:{Client:class{}},
    '../../../modules/flash-sale/service':{},'../../../modules/flash-sale':{FLASH_SALE_MODULE:'flash'},
    '../../../lib/flash-sale-title':titleRules,
  })
  const service={createFlashSaleItemsBatch:async items=>{saved=items;return items}}
  const res={code:200,status(code){this.code=code;return this},json(value){return {status:this.code,...value}}}
  const item={product_id:'p',variant_id:'v',flash_sale_price:90,original_price:100,expires_at:'2099-01-01'}
  const result=await route.POST({body:{title:' Weekend deals ',items:[item]},scope:{resolve:name=>name==='flash'?service:{}}},res)
  assert.equal(result.status,200)
  assert.equal(saved[0].title,'Weekend deals')
  assert.equal(saved[0].variant_id,'v')
  assert.equal(saved[0].flash_sale_price,90)
  saved=undefined
  const invalid=await route.POST({body:{title:'x'.repeat(121),items:[item]},scope:{resolve:()=>service}},res)
  assert.equal(invalid.status,400)
  assert.equal(saved,undefined)
})
test('all-deals API uses an independent cache and requests the complete upstream catalogue', async () => {
  const calls=[],filters=[]
  const route=load('src/app/api/medusa/flash-sale/products/route.ts',{
    'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},
    axios:{get:async url=>{calls.push(url);return {data:{active:true,products:[]}}}},
    '@/lib/flash-sale-cache':load('src/lib/flash-sale-cache.ts'),
    '@/lib/home-flash-sale':{inStockHomeFlashSale:async(data,options)=>{filters.push(options);return data}},
  })
  for(const query of ['in_stock=1','in_stock=1&all=1','in_stock=1&all=1']) {
    await route.GET({nextUrl:new URL('https://shop.example/api/medusa/flash-sale/products?'+query)})
  }
  assert.deepEqual(calls,['https://backend.example/store/flash-sale/products','https://backend.example/store/flash-sale/products?all=1'])
  assert.deepEqual(filters.map(f=>f.all),[false,true,true])
})
test('full store response includes the saved heading and all published deals across batches', async () => {
  const expiry='2099-01-01T00:00:00.000Z'
  const items=Array.from({length:75},(_,i)=>({id:'sale-'+i,product_id:'p-'+i,variant_id:'v-'+i,title:'Weekend Deals',flash_sale_price:'90.00',original_price:'100.00',expires_at:expiry}))
  const batches=[]
  const route=load('my-medusa-store/src/api/store/flash-sale/products/route.ts',{
    '@medusajs/framework/utils':{Modules:{PRODUCT:'product'}},
    '../../../../modules/flash-sale/service':{},'../../../../modules/flash-sale':{FLASH_SALE_MODULE:'flash'},
  })
  const service={getAllFlashSaleItems:async()=>items}
  const catalog={listProducts:async(filter,config)=>{
    batches.push(filter.id.length);assert.equal(config.take,60);assert.equal(filter.status[0],'published')
    return filter.id.filter(id=>id!=='p-74').map(id=>({id,title:id,status:'published'}))
  }}
  const result=await route.GET({query:{all:'1'},scope:{resolve:name=>name==='flash'?service:catalog}},{json:value=>value})
  assert.deepEqual(batches,[60,15])
  assert.equal(result.products.length,74)
  assert.equal(result.flash_sale.title,'Weekend Deals')
  assert.equal(result.products[0].flash_sale.title,'Weekend Deals')
  assert.equal(result.products[0].flash_sale_price,90)
  assert.equal(result.products.at(-1).id,'p-73')
})
