/* eslint-disable @typescript-eslint/no-require-imports -- Local-only browser regression with all vendor API writes intercepted. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const XLSX=require('xlsx');
const base=process.env.VENDOR_QA_URL || 'http://localhost:4001';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local QA only');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2X0AAAAASUVORK5CYII=','base64');
function rows(n,extra={}){return Array.from({length:n},(_,i)=>({Title:'QA kettle '+i,Description:'QA description',Brand:'Generic',Category:'Home',Subcategory:'Kettles','HSN Code':'85167920','Country of Origin':'IN','Tax Code':'GST_18','MRP INR':1000,'Selling Price INR':800,'Inventory Count':3,Length:10,Width:10,Height:10,Weight:0.5,'Image 1':'http://images.example.test/one.png','Image 2':'https://images.example.test/two.png','Image 3':'https://images.example.test/three.png',...extra}));}
function workbook(data){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(data),'Products');return XLSX.write(w,{type:'buffer',bookType:'xlsx'});}
(async()=>{const browser=await chromium.launch({...(process.env.QA_CHROME_PATH ? {executablePath:process.env.QA_CHROME_PATH} : {}),headless:true});
try{
 async function setup(width=1280){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'vendor_token',value:'qa-only',url:base}]);await context.addInitScript(({origin})=>{if(window.top===window&&location.origin===origin)localStorage?.setItem('vendor_token','qa-only')},{origin:base});
  const page=await context.newPage();const state={brandFailure:false,productFailure:false,imageFailure:false,referenceFailure:false,brandUploads:0,imageUploads:0,creates:[],errors:[],unexpected:[]};
  page.on('pageerror',e=>state.errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;
   if(url.protocol==='chrome:'||url.protocol==='chrome-extension:')return route.continue(); if(url.hostname==='files.example.test'&&p.endsWith('.pdf'))return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4 QA')}); if(url.origin!==base){if(req.resourceType()==='image')return route.fulfill({contentType:'image/png',body:png});state.unexpected.push(req.url());return route.abort();}
   if(!p.startsWith('/api/'))return route.continue();
   let data={};
   if((p.includes('product-categories')||p.endsWith('/vendor/categories'))){if(state.referenceFailure)return route.fulfill({status:503,json:{message:'QA references unavailable'}});data={product_categories:[{id:'cat_home',name:'Home',parent_category_id:null},{id:'cat_kettle',name:'Kettles',parent_category_id:'cat_home'}],count:2};}
   else if(p.includes('collections'))data={collections:[],count:0};
   else if((p.includes('product-types')||p.endsWith('/vendor/types')))data={product_types:[],count:0};
   else if((p.includes('product-tags')||p.endsWith('/vendor/tags')))data={product_tags:[],count:0};
   else if(p.endsWith('check-authorization'))data={requires_authorization:true,status:'missing'};
   else if(p.endsWith('upload-authorization')){state.brandUploads++;assert(req.postDataBuffer().includes(Buffer.from('Generic.pdf')));if(state.brandFailure)return route.fulfill({status:503,json:{error:'QA letter failure'}});data={authorization:{file_url:'https://files.example.test/Generic.pdf'}};}
   else if(p.endsWith('import-image-url'))data={url:'https://files.example.test/imported.png',key:'imported',stored:true};
   else if(p.endsWith('upload-image')){state.imageUploads++;if(state.imageFailure)return route.fulfill({status:500,json:{message:'QA image failure'}});data={files:[{url:'https://files.example.test/photo'+state.imageUploads+'.png',key:'qa',originalName:'one.png'}]};}
   else if(p.includes('estimate-rate'))data={success:true,freight_charge:50,quoted_at:new Date().toISOString(),expires_at:new Date(Date.now()+900000).toISOString(),routes:[{status:'quoted',quote:{freight_charge:50}}],coverage_complete:true};
   else if(p.endsWith('/vendor/products')&&req.method()==='POST'){const body=req.postDataJSON();state.creates.push(body);if(state.productFailure&&body.title==='QA kettle 1')return route.fulfill({status:503,json:{message:'QA product failure'}});data={product:{id:'qa_'+state.creates.length,...body}};}
   else if(p.endsWith('/profile'))data={vendor:{id:'vqa',name:'QA Vendor',store_name:'QA Store',status:'approved'}};
   else if(p.includes('pulse'))data={revision:'qa',to_accept:0,payout:{}};
   else if(p.endsWith('/health'))data={ok:true};
   else if(p.includes('inventory'))data={inventory:[],count:0};
   await route.fulfill({json:data});
  });
  await page.goto(base+'/products/bulk-upload',{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByRole('button',{name:'Choose file',exact:true}).waitFor({timeout:120000});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Choose file'&&!b.disabled),{},{timeout:60000});
  return {context,page,state};
 }
 async function upload(page,data){await page.locator('input[type=file][accept=".xlsx,.xls,.csv"]').setInputFiles({name:'QA.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook(data)});await page.getByText('QA.xlsx',{exact:true}).waitFor();}
 async function letter(page){await page.locator('#bulk-brand-letters input[type=file]').setInputFiles({name:'Generic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 QA letter')});await page.getByText('Selected, not submitted',{exact:true}).waitFor();}
 async function ready(page){await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Submit \d+ product/.test(b.textContent));return b&&!b.disabled;},{},{timeout:60000});}
 function clean(state){assert.deepEqual(state.errors,[]);assert.deepEqual(state.unexpected,[]);}
 // Actual XLSX -> prices/images -> letter failure -> retry -> partial product failure -> retry.
 {const {context,page,state}=await setup();await upload(page,rows(3));await letter(page);await ready(page);state.brandFailure=true;
  await page.getByRole('button',{name:'Submit 3 products',exact:true}).click();await page.getByText('Generic: QA letter failure',{exact:true}).first().waitFor();assert.equal(state.creates.length,0);await page.getByText('Selected, not submitted',{exact:true}).waitFor();
  state.brandFailure=false;state.productFailure=true;await ready(page);await page.getByRole('button',{name:'Submit 3 products',exact:true}).click();await page.getByRole('button',{name:'Review failed products'}).waitFor();assert.equal(state.creates.length,3);assert.equal(state.brandUploads,2);
  state.productFailure=false;await page.getByRole('button',{name:'Review failed products'}).click();await ready(page);await page.getByRole('button',{name:'Submit 1 product',exact:true}).click();await page.getByRole('button',{name:'Go to products',exact:true}).waitFor();assert.equal(state.creates.length,4);assert.equal(state.creates[3].title,'QA kettle 1');assert.equal(state.brandUploads,2);clean(state);console.log('PASS desktop actual XLSX, HTTP/HTTPS images, letter failure retained, partial product retry skips successes');await context.close();}
 // Phone preview must keep invalid data blocked and permit reset without submitting.
 {const {context,page,state}=await setup(390);await upload(page,rows(1,{'Inventory Count':-1}));assert(await page.getByRole('button',{name:'Submit 0 products'}).isDisabled());assert.equal(state.creates.length,0);await page.getByRole('button',{name:'Start over',exact:true}).click();await page.getByRole('button',{name:'Choose file',exact:true}).waitFor();clean(state);console.log('PASS mobile invalid stock blocks submission and reset returns to intro');await context.close();}

 // Local files, image upload failure/retry, and expanded variants on a phone.
 {const {context,page,state}=await setup(390);await upload(page,rows(1,{'Image 1':'one.png','Image 2':'two.png','Image 3':'three.png','Option 1 Name':'Color','Option 1 Value':'Red,Blue','Option 2 Name':'Size','Option 2 Value':'Small,Large'}));await letter(page);
  const input=page.locator('#bulk-product-images input[type=file]');const files=['one.png','two.png','three.png'].map(name=>({name,mimeType:'image/png',buffer:png}));state.imageFailure=true;await input.setInputFiles(files);
  await page.waitForFunction(()=>!document.querySelector('#bulk-product-images')?.textContent.includes('Checking / uploading images'));await page.waitForTimeout(200);assert.equal(state.imageUploads,3);assert(await page.getByRole('button',{name:'Submit 1 product (4 rows)',exact:true}).isDisabled());assert.equal(state.creates.length,0);
  state.imageFailure=false;await input.setInputFiles(files);await ready(page);await page.getByRole('button',{name:'Submit 1 product (4 rows)',exact:true}).click();await page.getByRole('button',{name:'Go to products',exact:true}).waitFor();assert.equal(state.creates.length,1);assert.equal(state.creates[0].variants.length,4);assert.equal(state.creates[0].images.length,3);assert.equal(state.imageUploads,6);clean(state);console.log('PASS mobile local photo failure/retry through proxy, one product with four variants and three photos');await context.close();}
 // 1000 rows: all retained, only 50 rows mounted per preview page.
 {const {context,page,state}=await setup();await upload(page,rows(1000));await page.locator('#bulk-product-details tbody tr').first().waitFor();assert.equal(await page.locator('#bulk-product-details tbody tr').count(),50);const nav=page.locator('#bulk-product-details nav').first();await nav.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#bulk-product-details tbody input[aria-label^="Title for row"]')?.value==='QA kettle 50');assert.equal(await page.locator('#bulk-product-details tbody tr').count(),50);assert.equal(state.creates.length,0);clean(state);console.log('PASS 1000-row workbook retains rows with 50-row pagination and no product writes');await page.getByRole('button',{name:'Start over',exact:true}).click();await page.locator('input[type=file][accept=".xlsx,.xls,.csv"]').setInputFiles({name:'too-many.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook(rows(1001))});await page.getByText('Maximum 1000 rows per file; split the spreadsheet',{exact:true}).waitFor();assert.equal(state.creates.length,0);console.log('PASS 1001-row file rejected without product writes');await context.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
