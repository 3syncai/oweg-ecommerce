const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');
function load(file,mocks={}){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(js,{module:mod,exports:mod.exports,require:n=>n in mocks?mocks[n]:require(n),console:{log(){},warn(){},error(){}},process:{env:{DATABASE_URL:'postgres://fixture'}},URL,URLSearchParams,fetch:mocks.fetch,AbortSignal,Map,Set,setTimeout,clearTimeout,Date,Headers,Buffer});return mod.exports;}
const filters=load('src/lib/search-filters.ts');
const productSort=load('src/lib/product-sort.ts');
test('multiword recall requires all words without requiring contiguous title text',()=>{assert.equal(filters.searchRecallTerm('wireless mouse'),'mouse');assert(filters.matchesSearchWords('Frontech Wireless Optical Mouse','wireless mouse'));assert(!filters.matchesSearchWords('Wired Optical Mouse','wireless mouse'));});
test('filters validate ranges and safely escape brand expressions',()=>{assert.throws(()=>filters.parseSearchFilters(new URLSearchParams('priceMin=500&priceMax=10')));assert.throws(()=>filters.parseSearchFilters(new URLSearchParams('minRating=6')));assert.throws(()=>filters.parseSearchFilters(new URLSearchParams('priceMin=Infinity')));const f=filters.parseSearchFilters(new URLSearchParams('priceMin=100&priceMax=500&brand=A%22%20OR%20in_stock%20%3D%20false'));const text=filters.searchFilterExpressions(f).join(' AND ');assert(text.includes('price >= 100'));assert(text.includes('A\\" OR'));});
test('search engine applies filters before pagination, keeps query scope and real count',async()=>{let options;const service=load('src/services/medusa/searchService.ts',{'@/lib/meilisearch':{getProductsIndexName:()=> 'products',getMeiliClient:()=>({index:()=>({search:async(q,o)=>{assert.equal(q,'wireless mouse');options=o;return {hits:[{id:'mouse_80',in_stock:true,title:'Wireless Optical Mouse'}],estimatedTotalHits:61,facetDistribution:{brand:{Frontech:61}}};}})})},'@/lib/search-query-normalize':{normalizeSearchQuery:s=>s,rewriteSearchTypos:s=>s},'@/lib/search-filters':filters});const result=await service.searchProducts('wireless mouse',{limit:24,offset:24,priceMax:500,brands:['Frontech'],minRating:4,categoryId:'cat'});assert.equal(options.offset,24);assert(options.filter.includes('price <= 500'));assert(options.filter.includes('rating >= 4'));assert(options.filter.some(x=>x.includes('category_ids')));assert.equal(result.total,61);assert.equal(result.brands[0],'Frontech');});
test('search engine outages propagate rather than becoming zero results',async()=>{const service=load('src/services/medusa/searchService.ts',{'@/lib/meilisearch':{getProductsIndexName:()=> 'p',getMeiliClient:()=>({index:()=>({search:async()=>{throw Error('offline')}})})},'@/lib/search-query-normalize':{normalizeSearchQuery:s=>s,rewriteSearchTypos:s=>s},'@/lib/search-filters':filters});await assert.rejects(service.searchProducts('mouse'));});
function route(index,medusa){return load('src/app/api/search/route.ts',{'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200})}},'@/services/medusa/searchService':{searchProducts:index,isInStockHit:p=>p.in_stock===true},'@/lib/medusa':{searchProducts:medusa,isMedusaProductInStock:p=>p.stock>0,toUiProduct:p=>({id:p.id,name:p.title,price:p.price??199,mrp:475,image:'x',brand:p.brand,inventory_quantity:p.stock})},'@/lib/search-query-normalize':{rewriteSearchTypos:s=>s},'@/lib/search-filters':filters,'@/lib/product-sort':productSort,'@/lib/paginated-in-stock':load('src/lib/paginated-in-stock.ts')});}
test('API recovers an in-stock noncontiguous mouse title without unrelated results',async()=>{let calls=[];const api=route(async()=>{throw Error('index unavailable')},async p=>{calls.push(p);return p.q==='mouse'?{products:[{id:'wanted',title:'Wireless Optical Mouse',stock:2},{id:'other',title:'Wired Mouse',stock:2},{id:'sold',title:'Wireless Mouse',stock:0}],count:3}:{products:[],count:0};});const r=await api.GET({url:'http://qa/api/search?q=wireless%20mouse'});assert.equal(r.status,200);assert.equal(r.body.products.length,1);assert.equal(r.body.products[0].id,'wanted');assert.equal(calls.length,2);assert(calls.every(c=>c.limit<=60));});
test('API returns 503 on complete outage and never applies global filters to a partial fallback',async()=>{let fallback=0;const api=route(async()=>{throw Error('offline')},async()=>{fallback++;throw Error('offline')});assert.equal((await api.GET({url:'http://qa/api/search?q=mouse'})).status,503);const r=await api.GET({url:'http://qa/api/search?q=mouse&priceMax=500'});assert.equal(r.status,503);assert.equal(fallback,2);});
test('a valid filtered zero-match remains zero; no fallback can bypass filters',async()=>{const api=route(async()=>({hits:[],total:0,brands:[]}),()=>{throw Error('must not fallback')});const r=await api.GET({url:'http://qa/api/search?q=mouse&priceMax=10'});assert.equal(r.status,200);assert.equal(r.body.count,0);});
test('shared category snapshot coalesces concurrent pages without losing canonical grouping input',async()=>{let reads=0;const rows=Array.from({length:100},(_,i)=>({id:'vendor_'+i}));const cached=load('src/lib/catalogue-read-cache.ts',{'next/cache':{unstable_cache:fn=>fn},'./medusa':{fetchCatalogCategoryProducts:async()=>{reads++;await new Promise(r=>setTimeout(r,10));return {products:rows,count:100,complete:true};}}});const [a,b]=await Promise.all([cached.fetchCatalogCategoryProducts('cat',{offset:0,fallbackLimit:40}),cached.fetchCatalogCategoryProducts('cat',{offset:40,fallbackLimit:40})]);assert.equal(reads,1);assert.equal(a.products.length,100);assert.equal(b.products.length,100);});
test('large category fallback still reads the requested page',async()=>{let inputs=[];const cached=load('src/lib/catalogue-read-cache.ts',{'next/cache':{unstable_cache:fn=>fn},'./medusa':{fetchCatalogCategoryProducts:async(id,o)=>{inputs.push(o);return {products:[{id:String(o.offset)}],count:800,complete:false}}}});const result=await cached.fetchCatalogCategoryProducts('cat',{offset:120,fallbackLimit:40});assert.equal(result.products[0].id,'120');assert.equal(inputs.length,2);});
test('responsive artwork is significantly smaller without changing source artwork',()=>{for(const f of fs.readdirSync('public/subcategory-banners').filter(f=>/\.(jpeg|webp)$/.test(f))){const base=path.parse(f).name;for(const width of [160,240,320]){const small=fs.statSync(`public/subcategory-banners/responsive/${base}-${width}.webp`).size;assert(small<fs.statSync(`public/subcategory-banners/${f}`).size);assert(small<45000);}}});
test('bounded pool reuses connections and handles idle errors without leaking connection details',()=>{let created=0,config,listener;class Pool{constructor(c){created++;config=c;}on(event,fn){listener=fn;}}const db=load('src/lib/bounded-pool.ts',{pg:{Pool}});assert.equal(db.getBoundedPool('postgres://fixture'),db.getBoundedPool('postgres://fixture'));assert.equal(created,1);assert.equal(config.max,4);assert.equal(config.connectionTimeoutMillis,5000);listener(Error('secret'));});
test('concurrent payment snapshot writes share bootstrap and never close a shared pool',async()=>{
 const queries=[];const pool={query:async(sql,args)=>{queries.push({sql,args});await new Promise(r=>setTimeout(r,1));return{rows:[]}},end:()=>{throw Error('shared pool must remain open')}};
 const snapshots=load('src/lib/checkout-payment-snapshot.ts',{pg:{},'@/lib/storefront-db':{tryGetStorefrontDatabaseUrl:()=> 'postgres://fixture'},'./bounded-pool':{getBoundedPool:()=>pool},'@/lib/payment-reliability':{},'@/lib/wallet-ledger':{},'@/lib/medusa-admin':{},'@/lib/checkout-order':{}});
 const results=await Promise.all(Array.from({length:30},(_,i)=>snapshots.saveCheckoutPaymentSnapshot({medusa_order_id:'order_'+i,items:[]})));
 assert(results.every(r=>r.ok));assert.equal(queries.filter(q=>q.sql.includes('CREATE TABLE')).length,1);assert.equal(queries.filter(q=>q.sql.includes('CREATE INDEX')).length,1);assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO')).length,30);
 assert(queries.filter(q=>q.sql.includes('INSERT INTO')).every(q=>q.sql.includes('ON CONFLICT (medusa_order_id) DO UPDATE')));
});
test('failed snapshot bootstrap remains retryable instead of poisoning the shared promise',async()=>{
 let failed=false;const pool={query:async(sql)=>{if(sql.includes('CREATE TABLE')&&!failed){failed=true;throw Error('temporary')}}};
 const snapshots=load('src/lib/checkout-payment-snapshot.ts',{pg:{},'@/lib/storefront-db':{tryGetStorefrontDatabaseUrl:()=> 'postgres://fixture'},'./bounded-pool':{getBoundedPool:()=>pool},'@/lib/payment-reliability':{},'@/lib/wallet-ledger':{},'@/lib/medusa-admin':{},'@/lib/checkout-order':{}});
 assert.equal((await snapshots.saveCheckoutPaymentSnapshot({medusa_order_id:'order',items:[]})).ok,false);assert.equal((await snapshots.saveCheckoutPaymentSnapshot({medusa_order_id:'order',items:[]})).ok,true);
});
test('index downtime can still globally filter a complete small catalogue result across pages',async()=>{
 const items=Array.from({length:40},(_,i)=>({id:'p'+i,title:'Mouse',stock:2,price:i<30?999:199,brand:'Frontech'}));
 const api=route(async()=>{throw Error('offline')},async input=>{assert.equal(input.offset,0);return{products:items,count:40}});
 const r=await api.GET({url:'http://qa/api/search?q=mouse&priceMax=500&pageSize=5&page=2'});
 assert.equal(r.status,200);assert.equal(r.body.count,10);assert.equal(r.body.products[0].id,'p35');assert.equal(r.body.hasMore,false);
});
test('index downtime never applies filters to an incomplete 60-item window',async()=>{
 const api=route(async()=>{throw Error('offline')},async()=>({products:Array.from({length:60},(_,i)=>({id:String(i),title:'Mouse',stock:2})),count:100}));
 assert.equal((await api.GET({url:'http://qa/api/search?q=mouse&priceMax=500'})).status,503);
});
test('postal lookup rejects invalid pincodes before making an upstream request',async()=>{
 let calls=0;const api=load('src/app/api/pincode/[pin]/route.ts',{'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200})}},fetch:async()=>{calls++;throw Error('unexpected')}});
 const r=await api.GET({}, {params:Promise.resolve({pin:'1234'})});assert.equal(r.status,400);assert.equal(calls,0);
});
test('postal lookup reports an actual place and outage separately, without promising courier availability',async()=>{
 let fail=false;const api=load('src/app/api/pincode/[pin]/route.ts',{'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200})}},fetch:async(url,options)=>{assert.equal(url,'https://api.postalpincode.in/pincode/400001');assert(options.signal);if(fail)throw Error('offline');return{ok:true,json:async()=>[{PostOffice:[{Name:'Mumbai',District:'Mumbai',State:'Maharashtra'}]}]}}});
 const r=await api.GET({}, {params:Promise.resolve({pin:'400001'})});assert.equal(r.status,200);assert.equal(r.body.place,'Mumbai, Mumbai, Maharashtra');assert.equal(r.body.eta,undefined);assert.equal(r.body.serviceable,undefined);fail=true;assert.equal((await api.GET({}, {params:Promise.resolve({pin:'400001'})})).status,502);
});
test('out-of-range search pages are rejected rather than repeating a clamped last page',async()=>{
 const api=route(()=>{throw Error('must not read')},()=>{throw Error('must not read')});assert.equal((await api.GET({url:'http://qa/api/search?q=mouse&page=10000'})).status,400);
});

test('category price sort uses the grouped offer price before slicing and filters brands across pages', async () => {
  const cards = [
    { id: 'canon', catalog_product_id: 'canon', name: 'Brand A', brand: 'Brand', price: 900 },
    { id: 'offer', catalog_product_id: 'canon', name: 'Brand A', brand: 'Brand', price: 100 },
    { id: 'b', name: 'Brand B', brand: 'Brand', price: 300 },
    { id: 'c', name: 'Other C', brand: 'Other', price: 200 },
    { id: 'd', name: 'Brand D', brand: 'Brand', price: 300 },
    { id: 'sold', name: 'Brand E', brand: 'Brand', price: 50, sold: true },
  ].map(row => ({ ...row, image: '/a.webp', mrp: row.price, discount: 0 }))
  const build = complete => load('src/lib/category-listing.ts', {
    '@/lib/catalogue-read-cache': { fetchCatalogCategoryProducts: async () => ({ products: cards, complete, count: complete ? cards.length : 700 }) },
    '@/lib/medusa': { isMedusaProductInStock: row => !row.sold, applySpecialPricesToProduct: row => row, toUiProduct: row => row },
    '@/lib/price-lists': { getPriceListPrices: async () => new Map() },
    '@/lib/catalog-product-group': load('src/lib/catalog-product-group.ts', { './stock-availability': load('src/lib/stock-availability.ts') }),
    '@/lib/paginated-in-stock': load('src/lib/paginated-in-stock.ts'),
    '@/lib/product-sort': productSort,
  }).buildCategoryProductsPage
  const page = build(true)
  const scope = { categoryId: 'root', includeSubcategories: true, limit: 2, brands: ['brand'] }
  const first = await page({ ...scope, sort: 'price-asc' })
  const next = await page({ ...scope, offset: 2, sort: 'price-asc' })
  const reversed = await page({ ...scope, sort: 'price-desc' })
  assert.equal(Array.from(first.products, row => row.id).join(','), 'canon,b')
  assert.equal(first.products[0].price, 100)
  assert.equal(first.count, 3)
  assert.equal(Array.from(first.brandOptions).join(','), 'Brand,Other')
  assert.equal(Array.from(next.products, row => row.id).join(','), 'd')
  assert.equal(Array.from(reversed.products, row => row.id).join(','), 'b,d')
  const incomplete = await build(false)({ ...scope, sort: 'price-desc' })
  assert.equal(incomplete.complete, false)
  assert.equal(incomplete.products[0].id, 'canon')
})

test('search sends index sort with pagination and sorts complete fallback results only', async () => {
  let engineOptions
  const service = load('src/services/medusa/searchService.ts', {
    '@/lib/meilisearch': {
      getProductsIndexName: () => 'products',
      getMeiliClient: () => ({ index: () => ({ search: async (_query, options) => {
        engineOptions = options
        return { hits: [], estimatedTotalHits: 0 }
      } }) }),
    },
    '@/lib/search-query-normalize': { normalizeSearchQuery: value => value, rewriteSearchTypos: value => value },
    '@/lib/search-filters': filters,
  })
  await service.searchProducts('mouse', { sort: 'price-desc', offset: 24 })
  assert.equal(engineOptions.sort.join(','), 'price:desc')
  assert.equal(engineOptions.offset, 24)
  await service.searchProducts('mouse')
  assert.equal(engineOptions.sort, undefined)

  const rows = [900, 500, 100, 200].map((price, index) => ({ id: String(index), title: 'Mouse', price, stock: 1 }))
  const offline = async () => { throw Error('index unavailable') }
  const complete = route(offline, async () => ({ products: rows, count: 4 }))
  const page = await complete.GET({ url: 'http://qa/api/search?q=mouse&sort=price-asc&pageSize=2&page=2' })
  assert.equal(page.status, 200)
  assert.equal(Array.from(page.body.products, row => row.price).join(','), '500,900')
  const partial = route(offline, async () => ({ products: rows, count: 90 }))
  assert.equal((await partial.GET({ url: 'http://qa/api/search?q=mouse&sort=price-asc' })).status, 503)
})
