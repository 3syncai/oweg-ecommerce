// Real React cart, provider and mutation hooks; simulated network only. No live customer data.
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const bundle = await esbuild.build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React,{useState} from 'react';import{createRoot}from'react-dom/client';
      import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      import CartProvider,{useCartSummary}from'./src/contexts/CartProvider';
      import{useAddToCartWithNotification,useAddToCart}from'./src/hooks/useCartMutations';
      import{useCart}from'./src/hooks/useCart';import Cart from'./src/app/cart/Cart';
      const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
      function Shop(){const[view,setView]=useState(false);window.openCart=()=>setView(true);
        const {count}=useCartSummary();const add=useAddToCartWithNotification('QA mouse');const raw=useAddToCart();
        useCart();window.burst=()=>Promise.allSettled(['variant_a','variant_b'].map(variant_id=>raw.mutateAsync({variant_id})));
        return <><p data-testid="badge">{count}</p><button onClick={()=>setView(true)}>Open cart</button>
        <button disabled={add.isLoading} onClick={()=>add.addToCart('variant_a').catch(()=>{})}>Add QA mouse</button>
        <p data-testid="adding">{String(add.isLoading)}</p>{view&&<Cart/>}</>}
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><CartProvider><Shop/></CartProvider></QueryClientProvider>);
    `},
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^(next\/(link|image|navigation)|@\/contexts\/AuthProvider|@\/lib\/(notifications|razorpay-warmup))$/ }, a => ({ path: a.path, namespace: 'qa' }));
      b.onResolve({ filter: /^[^./]/ }, a => a.path.startsWith('@/') ? undefined : ({path:require.resolve(a.path,{paths:[process.cwd()]})}));
      b.onResolve({filter:/\.css$/},a=>({path:a.path,namespace:'css-mock'}));
      b.onLoad({filter:/.*/,namespace:'css-mock'},()=>({loader:'js',contents:'export default {}'}));
      b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ loader: 'jsx', contents:
        a.path === 'next/link' ? `import React from'react';export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}` :
        a.path === 'next/image' ? `import React from'react';export default function Image({fill,priority,sizes,...p}){return <img {...p}/ >}` :
        a.path === 'next/navigation' ? `export function useRouter(){return{push:()=>window.openCart(),prefetch:()=>{}}}` :
        a.path.endsWith('AuthProvider') ? `export function useAuth(){return{customer:{id:'customer_qa'},initializing:false}}` :
        a.path.endsWith('razorpay-warmup') ? `export function warmRazorpayCheckout(){}` :
        `const record=(kind,...args)=>window.notices.push({kind,args:args.filter(x=>typeof x!=='function')});
        export const notifyCartAddSuccess=(...a)=>{record('success',...a);window.viewCart=a[2]};
        export const notifyCartAddError=(...a)=>record('error',...a);
        export const notifyCartUnavailable=()=>{},notifyQuantityUpdated=()=>{},notifyRemoveItem=()=>{},notifyActionError=(...a)=>record('error',...a),notifyCouponCheckoutOnly=()=>{},notifyCouponInvalid=()=>{};`
      }));
    } }],
  });
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    async function test(name, config, verify) {
      const page = await browser.newPage({viewport:{width:config.mobile ? 390 : 1280,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'}));
      await page.goto('http://cart.test/');
      await page.evaluate(config=>{
        window.notices=[];window.calls=[];window.maxActive=0;window.active=0;window.gets=0;window.serverItems=config.initial ? [{id:'line_a',variant_id:'variant_a',title:'QA mouse',unit_price:199,quantity:1}] : [];
        window.failRead=!!config.failRead;window.failWrite=!!config.failWrite;window.holdWrite=!!config.holdWrite;
        const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
        const delay=ms=>new Promise(r=>setTimeout(r,ms));
        window.fetch=async(url,init={})=>{
          const method=init.method||'GET';window.calls.push({url:String(url),method});
          if(!String(url).startsWith('/api/medusa/cart'))return response({products:[]});
          if(method==='GET'){
            window.gets++;const items=structuredClone(window.serverItems);
            if(config.slowRead)await delay(250);
            if(window.failRead)return response({error:'temporarily unavailable'},503);
            return response({cart:{id:items.length?'cart_qa':null,items}});
          }
          window.active++;window.maxActive=Math.max(window.maxActive,window.active);
          try{
            while(window.holdWrite)await delay(10);
            await delay(50);
            if(window.failWrite)return response({error:'Seller stock unavailable'},409);
            const body=init.body?JSON.parse(init.body):{};
            if(method==='POST'){
              const existing=window.serverItems.find(i=>i.variant_id===body.variant_id);
              if(existing)existing.quantity+=body.quantity||1;
              else window.serverItems.push({id:'line_'+body.variant_id,variant_id:body.variant_id,title:'QA mouse',unit_price:199,quantity:body.quantity||1});
            }else if(method==='PATCH'){
              window.serverItems.find(i=>String(url).endsWith(i.id)).quantity=body.quantity;
            }else window.serverItems=window.serverItems.filter(i=>!String(url).endsWith(i.id));
            if(config.loseResponse)throw new Error('network interrupted after commit');
            // authoritative response includes all earlier writes, like Medusa.
            return response({cart:{id:'cart_qa',items:structuredClone(window.serverItems)},guestCartId:'cart_qa'});
          }finally{window.active--;}
        };
      },config);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      try {await verify(page);assert.deepEqual(errors,[]);console.log('PASS:',name);}finally{await page.close();}
    }
    const badge=async(p,n)=>{await p.getByTestId('badge').filter({hasText:new RegExp('^'+n+'$')}).waitFor();};
    await test('success/View cart waits for persistence; header and cart share committed items', {holdWrite:true,mobile:true}, async p=>{
      await p.getByRole('button',{name:'Add QA mouse',exact:true}).click();
      await p.getByTestId('adding').filter({hasText:'true'}).waitFor();
      assert.equal(await p.evaluate(()=>window.notices.length),0);
      await p.getByRole('button',{name:'Open cart',exact:true}).click();
      assert.equal(await p.getByRole('heading',{name:'Your cart is empty',exact:true}).count(),0);
      await p.getByRole('status',{name:'Loading your cart'}).waitFor();
      await p.evaluate(()=>window.holdWrite=false);await badge(p,1);
      await p.getByText('QA mouse',{exact:true}).waitFor();
      assert.equal(await p.evaluate(()=>window.notices.filter(n=>n.kind==='success').length),1);
      assert.equal(await p.evaluate(()=>localStorage.getItem('guest_cart_id')),'cart_qa');
      assert.equal(await p.getByRole('link',{name:'Proceed to checkout',exact:true}).count(),1);
    });
    await test('failed add never announces success or changes header/cart', {failWrite:true}, async p=>{
      await p.getByRole('button',{name:'Add QA mouse',exact:true}).click();
      await p.waitForFunction(()=>window.notices.some(n=>n.kind==='error'));
      await badge(p,0);assert.equal(await p.evaluate(()=>window.notices.some(n=>n.kind==='success')),false);
    });
    await test('lost write response reconciles by GET and never replays POST', {loseResponse:true}, async p=>{
      await p.getByRole('button',{name:'Add QA mouse',exact:true}).click();
      await p.waitForFunction(()=>window.notices.some(n=>n.kind==='error'));await badge(p,1);
      assert.equal(await p.evaluate(()=>window.calls.filter(c=>c.method==='POST').length),1);
      assert.equal(await p.evaluate(()=>window.serverItems[0].quantity),1);
      assert.equal(await p.evaluate(()=>window.notices.some(n=>n.kind==='success')),false);
    });
    await test('concurrent first additions serialize and preserve both lines', {}, async p=>{
      await p.evaluate(()=>window.burst());await badge(p,2);
      assert.equal(await p.evaluate(()=>window.maxActive),1);
      assert.equal(await p.evaluate(()=>window.serverItems.length),2);
      await p.getByRole('button',{name:'Open cart',exact:true}).click();
      assert.equal(await p.locator('.cart-line-card').count(),2);
    });
    await test('obsolete slow GET cannot overwrite successful add', {slowRead:true}, async p=>{
      await p.getByRole('button',{name:'Add QA mouse',exact:true}).click();await badge(p,1);
      await p.waitForTimeout(400);await badge(p,1);
      await p.getByRole('button',{name:'Open cart',exact:true}).click();await p.getByText('QA mouse',{exact:true}).waitFor();
    });
    await test('initial loading and network failure are distinct from an empty cart; Retry recovers', {failRead:true,slowRead:true}, async p=>{
      await p.getByRole('button',{name:'Open cart',exact:true}).click();
      await p.getByRole('status',{name:'Loading your cart'}).waitFor();
      assert.equal(await p.getByRole('heading',{name:'Your cart is empty',exact:true}).count(),0);
      await p.getByRole('button',{name:'Retry loading cart',exact:true}).waitFor();
      assert.equal(await p.getByText('24 Energy 100 Watt Emergency Bulb').count(),0);
      assert.equal(await p.getByRole('link',{name:'Proceed to checkout',exact:true}).count(),0);
      await p.waitForFunction(()=>!document.querySelector('[role="status"]'));
      await p.evaluate(()=>window.failRead=false);
      await p.getByRole('button',{name:'Retry loading cart',exact:true}).click();
      await p.getByRole('heading',{name:'Your cart is empty',exact:true}).waitFor();
    });
    await test('quantity and remove publish confirmed totals/badge with no extra rehydration GET', {initial:true}, async p=>{
      await badge(p,1);await p.getByRole('button',{name:'Open cart',exact:true}).click();
      const plus=p.getByRole('button',{name:'Increase',exact:true}).first();await plus.click();await badge(p,2);
      await p.getByRole('button',{name:'Remove QA mouse',exact:true}).click();await badge(p,0);
      await p.getByRole('heading',{name:'Your cart is empty',exact:true}).waitFor();
      assert.equal(await p.evaluate(()=>window.serverItems.length),0);
      assert.equal(await p.evaluate(()=>window.gets),1);
    });
    await test('failed quantity change retains confirmed item and can be retried', {initial:true,failWrite:true}, async p=>{
      await badge(p,1);await p.getByRole('button',{name:'Open cart',exact:true}).click();
      await p.getByRole('button',{name:'Increase',exact:true}).first().click();
      await p.waitForFunction(()=>window.notices.some(n=>n.kind==='error'));await badge(p,1);
      await p.evaluate(()=>window.failWrite=false);
      await p.getByRole('button',{name:'Increase',exact:true}).first().click();await badge(p,2);
    });
    await test('cross-tab change event refreshes the active shared cart', {initial:true}, async p=>{
      await badge(p,1);await p.evaluate(()=>{window.serverItems[0].quantity=3;window.dispatchEvent(new StorageEvent('storage',{key:'oweg_cart_updated',newValue:'new'}));});await badge(p,3);
    });
    // Two real same-origin browser tabs, exercising native Web Locks + storage events.
    const context=await browser.newContext();
    const items=[];let active=0,maxActive=0;const writeCookies=[];
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/medusa/cart/line-items'){
        active++;maxActive=Math.max(maxActive,active);writeCookies.push(req.headers().cookie||'');
        await new Promise(r=>setTimeout(r,100));
        const body=req.postDataJSON();const existing=items.find(i=>i.variant_id===body.variant_id);
        if(existing)existing.quantity++;else items.push({id:body.variant_id,variant_id:body.variant_id,title:'QA mouse',unit_price:199,quantity:1});
        await route.fulfill({status:200,headers:{'content-type':'application/json','set-cookie':'cart_id=cart_qa; Path=/; SameSite=Lax'},body:JSON.stringify({cart:{id:'cart_qa',items},guestCartId:'cart_qa'})});
        active--;return;
      }
      if(url.pathname==='/api/medusa/cart')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({cart:{id:items.length?'cart_qa':null,items}})});
      return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
    });
    try{
      const tabs=await Promise.all([context.newPage(),context.newPage()]);
      for(const p of tabs){await p.goto('https://cart.test/');await p.evaluate(()=>{window.notices=[];});await p.addScriptTag({content:bundle.outputFiles[0].text});await badge(p,0);assert(await p.evaluate(()=>!!navigator.locks));}
      await Promise.all(tabs.map(p=>p.getByRole('button',{name:'Add QA mouse',exact:true}).click()));
      await Promise.all(tabs.map(p=>badge(p,2)));
      assert.equal(maxActive,1);assert.equal(items.length,1);assert.equal(items[0].quantity,2);
      assert.match(writeCookies[1],/cart_id=cart_qa/);
      console.log('PASS: two browser tabs serialize first-cart writes, reuse identity and converge to the same quantity');
    }finally{await context.close();}
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
