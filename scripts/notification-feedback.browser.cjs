// Actual Sonner, feedback helpers, wishlist component and wishlist mutations.
// All network traffic is intercepted. No live customer data is used.
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const bundle = await esbuild.build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';import{createRoot}from'react-dom/client';
      import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      import Toaster from'./src/components/ui/app-toaster';
      import Wishlist from'./src/components/account/WishlistContent';
      import{toast}from'sonner';import * as n from'./src/lib/notifications';
      window.feedback=n;window.dismiss=()=>toast.dismiss();
      const root=createRoot(document.getElementById('root'));window.dispose=()=>root.unmount();
      root.render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><main><button id="trigger" onClick={()=>n.notifyCartAddSuccess('Extremely long product title '.repeat(12),1,()=>window.viewed=true)}>Add fixture</button><Wishlist/></main><Toaster/><nav aria-label="Primary" style={{position:'fixed',bottom:0,height:69,width:'100%',background:'white'}}>Mobile navigation fixture</nav></QueryClientProvider>);
    ` }, bundle: true, write: false, outdir: 'qa', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-boundaries', setup(b) {
      b.onResolve({ filter: /^(next\/(link|image|navigation)|@\/contexts\/AuthProvider|@\/hooks\/useCartMutations)$/ }, a => ({ path: a.path, namespace: 'qa' }));
      b.onResolve({ filter: /^\/icons\// }, a => ({path:a.path,external:true}));
      b.onResolve({ filter: /^[^./]/ }, a => a.path.startsWith('@/') ? undefined : ({ path: require.resolve(a.path, { paths: [process.cwd()] }) }));
      b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ loader: 'jsx', contents:
        a.path==='next/link' ? `import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}` :
        a.path==='next/image' ? `import React from'react';export default function Image({fill,priority,sizes,...props}){return <img {...props}/ >}` :
        a.path==='next/navigation' ? `export const useRouter=()=>({push:p=>window.destination=p});export const usePathname=()=>'/wishlist';` :
        a.path.endsWith('useCartMutations') ? `export const useAddToCart=()=>({isPending:false,mutateAsync:async()=>({})});` :
        `import{useSyncExternalStore}from'react';let customer={id:'c',metadata:{wishlist:['p']}};const listeners=new Set();const set=c=>{customer=c;listeners.forEach(l=>l())};window.switchCustomer=()=>set({id:'d',metadata:{wishlist:[]}});export function useAuth(){const c=useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l)},()=>customer);return{customer:c,initializing:false,updateWishlist:(id,fn)=>{if(customer?.id===id)set({...customer,metadata:{...customer.metadata,wishlist:fn(customer.metadata.wishlist)}})}}}`
      }));
    } }],
  });
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  async function fixture(width, verify) {
    const page=await browser.newPage({viewport:{width,height:844},hasTouch:width<768});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const saved=new Set(['p']);const writes=[];let fail=false;
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!url.pathname.startsWith('/api/'))return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
      if(url.pathname.includes('wishlist')) {
        if(req.method()!=='GET') {
          const {productId}=req.postDataJSON();writes.push([req.method(),productId]);
          if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture unavailable'})});
          req.method()==='DELETE'?saved.delete(productId):saved.add(productId);
        }
        return route.fulfill({contentType:'application/json',body:JSON.stringify({customer:{id:'c'},wishlist:[...saved],products:saved.has('p')?[{id:'p',title:'QA saved product',handle:'qa',price:199,variant_count:1,variant_id:'v'}]:[]})});
      }
      return route.fulfill({contentType:'application/json',body:'{}'});
    });
    try {
      await page.goto('http://feedback.test/');
      await page.addStyleTag({content:`body{margin:0;font-family:Arial}*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(min-width:768px){nav[aria-label=Primary]{display:none}}${css}`});
      await page.addScriptTag({content:js});await page.getByRole('button',{name:'Remove from wishlist',exact:true}).waitFor();
      await verify(page,{saved,writes,setFail:v=>fail=v});assert.deepEqual(errors,[]);
    } finally {await page.close()}
  }
  try {
    for(const width of [320,390,768,1280])await fixture(width,async p=>{
      await p.locator('#trigger').focus();await p.locator('#trigger').click();
      const toast=p.locator('[data-sonner-toast][data-front="true"]');await toast.waitFor();await p.waitForTimeout(400);
      assert.match(await toast.innerText(),/Added to cart/);assert(!/Extremely long/.test(await toast.innerText()));
      const rect=await toast.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);assert(rect.height<110);
      if(width<768){assert(rect.y+rect.height<=844-80);assert((await toast.getByRole('button',{name:'View cart',exact:true}).boundingBox()).height>=44)}
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.FEEDBACK_QA_SCREENSHOTS && width===390)await p.screenshot({path:require('node:path').join(process.env.FEEDBACK_QA_SCREENSHOTS,'oweg-feedback-mobile.png')});
      assert.equal(await p.evaluate(()=>document.activeElement.id),'trigger');
      assert.equal(await p.locator('section[aria-live="polite"]').count(),1);
      await toast.getByRole('button',{name:'View cart',exact:true}).click();assert(await p.evaluate(()=>window.viewed));
      console.log(`PASS compact feedback at ${width}px: bounds, touch targets, nav clearance, focus and View cart`);
    });
    await fixture(390,async p=>{
      await p.evaluate(()=>{window.feedback.notifyWishlistSuccess('Long title');window.feedback.notifyQuantityUpdated('Long title',3)});
      assert.equal(await p.locator('[data-sonner-toast]').count(),0);assert.equal(await p.getByRole('status').innerText(),'Quantity updated to 3');
      await p.evaluate(()=>{for(let i=0;i<8;i++)window.feedback.notifyCartAddSuccess('x',1);window.feedback.notifyWishlistLogin(()=>window.signedIn=true)});
      const toast=p.locator('[data-sonner-toast]');await toast.getByRole('button',{name:'Sign in',exact:true}).waitFor();assert.equal(await toast.count(),1);
      assert(!/Added to cart/.test(await toast.innerText()));await toast.getByRole('button',{name:'Sign in',exact:true}).click();assert(await p.evaluate(()=>window.signedIn));
      await p.evaluate(()=>window.feedback.notifyCartAddError('Stock changed. Choose another size.'));
      const error=p.locator('[data-sonner-toast][data-front="true"]');await error.getByText('Stock changed. Choose another size.').waitFor();
      assert.equal(await error.getByRole('button',{name:'Sign in',exact:true}).count(),0);
      await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await error.evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
      console.log('PASS silent wishlist/quantity announcements, replacement, login action, errors and reduced motion');
    });
    await fixture(390,async(p,{saved,writes})=>{
      await p.getByRole('button',{name:'Remove from wishlist',exact:true}).click();await p.getByRole('button',{name:'Undo',exact:true}).waitFor();assert(!saved.has('p'));
      await p.getByRole('button',{name:'Undo',exact:true}).click();await p.getByRole('button',{name:'Remove from wishlist',exact:true}).waitFor();assert(saved.has('p'));assert.deepEqual(writes,[['DELETE','p'],['POST','p']]);
      console.log('PASS wishlist Undo restores the same product through the authenticated mutation path');
    });
    await fixture(390,async(p,{writes})=>{
      await p.getByRole('button',{name:'Remove from wishlist',exact:true}).click();await p.getByRole('button',{name:'Undo',exact:true}).waitFor();
      await p.evaluate(()=>window.switchCustomer());await p.waitForFunction(()=>!document.querySelector('[data-sonner-toast]'));
      assert.deepEqual(writes,[['DELETE','p']]);console.log('PASS account switch dismisses stale Undo and does not save to another customer');
    });
    await fixture(390,async(p,{saved,setFail,writes})=>{
      await p.getByRole('button',{name:'Remove from wishlist',exact:true}).click();await p.getByRole('button',{name:'Undo',exact:true}).waitFor();setFail(true);
      await p.getByRole('button',{name:'Undo',exact:true}).click();await p.getByText('Couldn’t restore item',{exact:true}).waitFor();assert(!saved.has('p'));assert.deepEqual(writes,[['DELETE','p'],['POST','p']]);
      console.log('PASS failed Undo shows an error and keeps reconciled server state');
    });
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
