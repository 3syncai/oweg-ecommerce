// Exercise the shipped forms in Chromium using local fixtures instead of customer records.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main() {
  const router = 'const router={push(){}};export function useRouter(){return router}';
  const mocks = {
    'next/navigation':router, 'next/image':'export default "img"', 'next/link':'export default "a"',
    '@/components/VendorShell':'export default function Shell({children}){return children}',
    '@/lib/api/client':'export const vendorInventoryApi={list:async()=>window.inventory,update:async(id,qty)=>{window.stockWrites.push(qty);return {success:!window.failStock}}}',
    '@/lib/useVendorLive':'export function useVendorLive(){}',
    '@medusajs/admin-sdk':'export const defineRouteConfig=x=>x',
    '../../lib/admin-backend':'export const getAdminBackendUrl=()=>""',
    '@/lib/shipping-rules':'export const FREE_SHIPPING_THRESHOLD_RUPEES=499, SHIPPING_CHARGE_RUPEES=50',
  };
  const bundle = await esbuild.build({
    stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Inventory from './vendor-portal/app/inventory/page';
      import Sale from './my-medusa-store/src/admin/routes/flash-sale/page';
      import Delivery from './src/app/productDetail/components/DeliveryInfo';
      const root=createRoot(document.getElementById('root'));
      window.showPolicy=policy=>root.render(<Delivery policy={policy} pinCode="" pinStatus="idle" pinMessage="" onCheck={()=>{}} onPinCodeChange={()=>{}}/>);
      if(location.pathname==='/inventory') root.render(<Inventory/>);
      else if(location.pathname==='/flash')root.render(<Sale/>);
      else window.showPolicy(null);`},
    bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'fixture',setup(build){
      build.onResolve({filter:/.*/},a=>{
        if(a.path in mocks || a.path.endsWith('.module.css') || a.path.startsWith('@/components/'))return {path:a.path,namespace:'fixture'};
        if(/^(react(?:-dom)?(?:\/.*)?|scheduler)$/.test(a.path))return {path:require.resolve(a.path)};
        if (/^[^./]/.test(a.path)) return {path:require.resolve(a.path,{paths:[a.resolveDir,path.resolve('vendor-portal'),path.resolve('my-medusa-store'),process.cwd()]})};
      });
      build.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]??(a.path.endsWith('.css')?'export default {}':'export default function Widget(){return null}'),loader:'jsx'}));
    }}],
  });
  const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:840}});page.setDefaultTimeout(5500);
      await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
      const open=async name=>{
        await page.goto('http://market.test/'+name);
        await page.evaluate(()=>{
          window.alert=()=>{};window.stockWrites=[];window.failStock=true;
          window.inventory={success:true,count:1,inventory:[{product_id:'p',variant_id:'v',variant_title:'Blue',product_title:'QA kettle',variant_sku:'TEST',stock_quantity:20}]};
          const products=['Mumbai','Bihar','Delhi'].map((seller,i)=>({id:'p'+i,variant_id:'v'+i,title:'QA '+seller,price:100,best:100,seller,sku:'SKU'+i}));
          window.submissions=[];
          window.fetch=async(url,options)=>{
            if(options?.method==='POST'){
              const items=JSON.parse(options.body).items;window.submissions.push(items);
              if(window.submissions.length===1)return Response.json({issues:items.slice(0,2).map((item,i)=>({...item,seller:products[i].seller,price:item.flash_sale_price,reason:'Match current competing offer.'}))},{status:400});
            }
            return Response.json(String(url).includes('/flash-sale/products')?{products,count:3}:{});
          };
        });
        await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
      };
      await open('inventory');
      const edit=page.getByLabel('Edit stock for Blue');
      if(!await edit.count())await page.getByRole('button',{name:/QA kettle/}).click();
      await edit.click();
      const quantity=page.getByLabel('Stock quantity',{exact:true}),save=page.getByLabel('Save stock quantity');
      for(const value of ['', '-2','1.5']){await quantity.fill(value);assert(await save.isDisabled())}
      assert.deepEqual(await page.evaluate(()=>window.stockWrites),[]);
      await quantity.fill('0');await page.getByText(/Saving 0/).waitFor();assert(await save.isEnabled());
      await page.getByLabel('Cancel stock edit').click();await edit.click();assert.equal(await quantity.inputValue(),'20');
      await quantity.fill('12');await save.click();assert.equal(await quantity.inputValue(),'12');
      await page.evaluate(()=>window.failStock=false);await save.click();await edit.waitFor();
      await edit.click();await quantity.fill('0');await save.click();await edit.waitFor();
      assert.deepEqual(await page.evaluate(()=>window.stockWrites),[12,12,0]);
      await open('flash');
      for(const input of await page.locator('input[type=datetime-local]').all())await input.fill('2099-01-01T12:00');
      for(const seller of ['Mumbai','Bihar','Delhi']){
        const row=page.getByText('QA '+seller,{exact:true}).locator('../..');
        await row.getByRole('checkbox').click();await row.getByRole('spinbutton').fill('80');
      }
      const publish=page.getByRole('button',{name:/^Create Flash Sale/});await publish.click();
      await page.getByRole('alert').getByText(/Mumbai.*competing/).waitFor();
      await page.getByRole('alert').getByText(/Bihar.*competing/).waitFor();
      for(const seller of ['Mumbai','Bihar'])await page.getByLabel('Flash price for '+seller,{exact:false}).fill('70');
      await publish.click();assert.deepEqual(await page.evaluate(()=>window.submissions[1].map(x=>x.flash_sale_price)),[70,70,80]);
      await open('policy');
      await page.getByText('Read return conditions').waitFor();assert.equal(await page.getByText(/within 7 days/).count(),0);
      for(const [r,s] of [[0,7],[14,3],[0,0]]){
        await page.evaluate(([r,s])=>window.showPolicy({return_window_days:r,replacement_window_days:s}),[r,s]);
        await page.getByText(new RegExp((r?'Returns within '+r:'Returns unavailable')+'.*'+(s?'Replacement within '+s:'Replacement unavailable'))).waitFor();
      }
      await page.close();console.log('PASS stock, flash batch and seller policy at width',width);
    }
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
