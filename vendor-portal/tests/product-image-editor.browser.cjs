/* eslint-disable @typescript-eslint/no-require-imports -- Optional isolated browser regression. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.VENDOR_QA_URL || 'http://localhost:4000';
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw Error('Local QA only');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2X0AAAAASUVORK5CYII=', 'base64');
(async () => {
 const browser = await chromium.launch({...(process.env.QA_CHROME_PATH ? {executablePath:process.env.QA_CHROME_PATH} : {}),headless:true});
 try {
  for (const variant of [false, true]) {
   const context = await browser.newContext({viewport:{width:variant?390:1280,height:900}});
   await context.addCookies([{name:'vendor_token',value:'qa-only',url:baseUrl}]);
   const page = await context.newPage(); const errors=[]; let navigations=0,uploads=0,fail=false,saved;
   page.on('pageerror',e=>errors.push(e.message)); page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++});
   await page.addInitScript(()=>localStorage.setItem('vendor_token','qa-only'));
   const old = 'https://example.test/old.png';
   const product = {id:'qa-edit',title:'QA pending product',handle:'qa-pending',status:'draft',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{approval_status:'pending',gst_rate:18,tax_code:'GST_18'},images:[{url:old}],thumbnail:old};
   await page.route('**/api/**', async route => {
    const req=route.request(),path=new URL(req.url()).pathname; let data={};
    if(path.endsWith('/upload-image')) { uploads++; return route.fulfill({status:fail?500:200,json:fail?{message:'QA storage failure'}:{files:[{url:`https://example.test/new${uploads}.png`}]}}); }
    if(path.endsWith('/products/qa-edit')) {
     if(req.method()==='PUT') {saved=req.postDataJSON(); return route.fulfill({json:{atomic_edit_version:1,variant_ids:['var_qa'],product:{...product,...saved,metadata:{...product.metadata,...saved.metadata,approval_status:'pending'}}}});}
     data={atomic_edit_version:1,product,variant_summary:{price:100,discounted_price:90},
      variant_matrix:{options:variant?[{title:'Color',values:['Silver']},{title:'Size',values:['Small']}]:[],variants:[{id:'var_qa',title:'Default',sku:'QA-TEST',manage_inventory:true,allow_backorder:false,inventory_quantity:3,price:100,discounted_price:90,option_values:variant?{Color:'Silver',Size:'Small'}:{}}]},color_images:variant?{Silver:[old]}:{},primary_visual_option:variant?'Color':undefined};
    } else if(path.endsWith('/profile')) data={vendor:{id:'vqa',name:'QA Vendor',store_name:'QA Store',status:'approved'}};
    else if(path.includes('product-categories'))data={product_categories:[]};
    else if(path.includes('collections'))data={collections:[]};
    else if(path.includes('inventory'))data={success:true,inventory:[]};
    else if(path.includes('pulse'))data={revision:'qa',to_accept:0,payout:{}};
    await route.fulfill({json:data});
   });
   await page.route('https://example.test/**',route=>route.fulfill({contentType:'image/png',body:png}));
   await page.goto(baseUrl+'/products/qa-edit',{waitUntil:'domcontentloaded',timeout:120000});
   await page.getByRole('button',{name:'Upload / edit images',exact:true}).waitFor({timeout:120000});
   const startUrl=page.url(); const initialNavigations=navigations;
   await page.getByPlaceholder('Enter product name').fill('QA edited product');
   await page.getByRole('button',{name:'Upload / edit images',exact:true}).click();
   assert.equal(page.url(),startUrl); assert.equal(navigations,initialNavigations);
   const zone=page.getByRole('group',{name:variant?'Silver images':'Product images',exact:true});
   const chooserPromise=page.waitForEvent('filechooser');await zone.getByRole('button',{name:'Choose images'}).click();
   const chooser=await chooserPromise;
   await chooser.setFiles({name:'qa-pick.png',mimeType:'image/png',buffer:png});
   await page.waitForFunction(()=>document.querySelectorAll('#product-images img').length>=2);
   assert.equal(page.url(),startUrl); assert.equal(navigations,initialNavigations);
   async function drop(target, name='qa-drop.png', type='image/png') {
    const transfer=await page.evaluateHandle(({name,type})=>{const data=new DataTransfer();data.items.add(new File(['qa-image'],name,{type}));return data;},{name,type});
    await target.dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();
   }
   await drop(zone);
   await page.waitForFunction(()=>document.querySelectorAll('#product-images img').length>=3);
   const before=uploads;await drop(zone,'no.txt','text/plain');assert.equal(uploads,before);
   await drop(page.locator('body'));assert.equal(page.url(),startUrl);assert.equal(navigations,initialNavigations);
   assert.equal(await page.getByPlaceholder('Enter product name').inputValue(),'QA edited product');
   fail=true;await drop(zone);
   await page.getByText('QA storage failure',{exact:true}).waitFor();assert.equal(await page.locator('#product-images img').count(),3);
   fail=false;
   if(!variant) {
    await page.locator('#product-images').getByRole('button',{name:'Set thumbnail',exact:true}).first().click();
    await page.locator('#product-images').getByRole('button',{name:'Remove',exact:true}).first().click();
   }
   await page.getByPlaceholder('Example: Updated price from ₹899 to ₹999, changed title, moved to Electronics collection.').fill('QA image update');
   await page.getByRole('button',{name:'Save & Send For Approval',exact:true}).click();
   await page.getByRole('heading',{name:'Product update submitted',exact:true}).waitFor();
   assert.ok(saved);assert.equal(saved.title,'QA edited product');assert.equal(saved.vendor_edit_remark,'QA image update');
   assert.equal(saved.variants[0].id,'var_qa');assert.equal(saved.variants[0].sku,'QA-TEST');
   if(variant) assert.equal(saved.color_images.Silver.length,3);
   else {assert.equal(saved.images.length,2);assert.equal(saved.thumbnail,'https://example.test/new1.png');}
   assert.deepEqual(errors,[]);
   console.log('PASS',variant?'mobile variant':'desktop simple','picker + drop + invalid/failure recovery + no navigation + approval payload');
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
