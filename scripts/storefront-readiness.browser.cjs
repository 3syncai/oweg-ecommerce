// Isolated browser checks: every network boundary is mocked; no live data is changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const output=await esbuild.build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Search from './src/app/search/page';import Delivery from './src/app/productDetail/components/DeliveryInfo';import{FlashSaleBadge}from './src/components/flash-sale/FlashSaleBadge';function App(){const [pin,setPin]=React.useState('');return location.pathname==='/search'?<Search/>:<main style={{maxWidth:600,margin:'32px auto',padding:20}}><h1>Purchase details</h1><FlashSaleBadge expiresAt={new Date(Date.now()+49*3600000).toISOString()}/><Delivery pinCode={pin} pinStatus='idle' pinMessage='' onPinCodeChange={setPin} onCheck={()=>{window.checkedPin=pin}}/></main>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,outfile:'qa-fixture.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-next',setup(b){
 b.onResolve({filter:/^(next\/(image|link|navigation)|@\/components\/ui\/BrandLoader)$/},a=>({path:a.path,namespace:'qa'}));

 b.onLoad({filter:/.*/,namespace:'qa'},a=>({loader:'jsx',contents:a.path==='next/navigation'?`const router={replace:url=>window.replaced=url};export function useSearchParams(){return new URLSearchParams(location.search)};export function useRouter(){return router}`:a.path==='next/link'?`import React from'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}`:a.path==='next/image'?`import React from'react';export default function Image({fill,priority,...p}){return <img {...p}/ >}`:`import React from'react';export default function Loader({label}){return <div role='status'>{label}</div>}`}));
 b.onResolve({filter:/^[^./]/},a=>a.path.startsWith('@/')?undefined:({path:require.resolve(a.path,{paths:[process.cwd()]})}));
 }}]});
 const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
 const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'}));
   await page.goto('http://storefront.test/search?q=wireless%20mouse');
   await page.evaluate(()=>{window.requests=[];window.fail=true;window.fetch=async(url)=>{requests.push(String(url));if(window.fail)return{ok:false,status:503};const filtered=String(url).includes('priceMax=');return{ok:true,json:async()=>({products:filtered?[{id:'mouse80',title:'Wireless Optical Mouse found across full catalogue',price:199}]:[{id:'mouse1',title:'Wireless Optical Mouse',price:199}],count:filtered?1:61,brands:['Frontech'],hasMore:!filtered})}}});
   await page.addStyleTag({content:css+'\n'+(output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')});await page.addScriptTag({content:output.outputFiles.find(file=>file.path.endsWith('.js')).text});
   await page.getByRole('alert').waitFor();assert.equal(await page.getByText('No results found',{exact:true}).count(),0);
   await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'Retry search'}).click();await page.getByText('61 products found',{exact:true}).waitFor();
   if(width<1024) await page.getByRole('button',{name:/^Filters/}).click();
   await page.getByRole('radio',{name:'Under ₹1,000',exact:true}).check();await page.getByText('1 matching products',{exact:true}).waitFor();
   assert((await page.evaluate(()=>window.requests)).some(u=>u.includes('priceMax=999.99')));
   assert.equal(errors.length,0,errors.join('; '));console.log(`PASS ${width}px: failure is Retry, recovery works, catalogue filters go to server with matching count`);
   await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://storefront.test/delivery');await page.addStyleTag({content:css+'\n'+(output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')});await page.addScriptTag({content:output.outputFiles.find(file=>file.path.endsWith('.js')).text});await page.getByLabel(/2 days,.*hours/).waitFor();assert.equal(await page.getByText(/49:/).count(),0);
  await page.getByLabel('Delivery pincode').fill('400001');await page.getByRole('button',{name:'Check area'}).click();assert.equal(await page.evaluate(()=>window.checkedPin),'400001');assert(await page.getByText(/Shipping ₹50/).isVisible());assert(await page.getByRole('link',{name:'Read return conditions'}).isVisible());
  await page.screenshot({path:path.resolve('../storefront-delivery-preview.png'),fullPage:true});console.log('PASS mobile delivery: editable pincode, shared shipping rules, policy link, long timer days format');await page.close();
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
