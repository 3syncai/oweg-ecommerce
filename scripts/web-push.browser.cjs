// Isolated browser fixtures. All requests are intercepted; no live sends or logins.
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function bundle(entry, unused, props = '', extra = '') {
  return esbuild.build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Component from '${entry}';${extra};createRoot(document.getElementById('root')).render(<Component ${props}/>);` },
    bundle: true, write: false, outdir: 'qa', format: 'iife', jsx: 'automatic', loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-boundaries', setup(b) {
      b.onResolve({ filter: /(@medusajs\/(admin-sdk|icons)|with-admin-page-access|admin-backend$|admin-auth-fetch$|AuthProvider$|^next\/(link|image|navigation)$)/ }, a => ({ path: a.path, namespace: 'qa' }));
      b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ loader: 'js', contents: a.path.endsWith('AuthProvider') ? "export const useAuth=()=>({customer:window.qaCustomer===undefined?{id:'cus_test'}:window.qaCustomer,initializing:false});" : a.path === 'next/navigation' ? "export const usePathname=()=>window.location.pathname;" : a.path === 'next/image' ? "import React from 'react';export default function Image({unoptimized,...p}){return React.createElement('img',p)}" : a.path === 'next/link' ? "import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}" : a.path.includes('admin-sdk') ? 'export const defineRouteConfig=x=>x;' : a.path.includes('icons') ? 'export const BellAlert=()=>null;' : a.path.includes('with-admin-page-access') ? 'export const withAdminPageAccess=x=>x;' : a.path.includes('admin-backend') ? "export const getAdminBackendUrl=()=>'';" : 'export const getAdminAuthHeaders=x=>new Headers(x);' }));
      b.onResolve({ filter: /^@\// }, a => ({ path: path.resolve('src', a.path.slice(2) + '.ts') }));
      b.onResolve({ filter: /^[^./]/ }, a => a.path.startsWith('@/') ? undefined : ({ path: require.resolve(a.path, { paths: [process.cwd()] }) }));
    } }],
  });
}
const campaign = { id: '11111111-1111-4111-8111-111111111111', revision: 1, title: 'Saved fixture', body: 'Test only', url: '/flash-sale', image: '', audience: [], expires_at: new Date(Date.now()+86400000).toISOString(), status: 'draft', recipients: 0, accepted: 0, failed: 0, scheduled_at: null };
(async () => {
  const admin = await bundle('./my-medusa-store/src/admin/routes/push-notifications/page.tsx', true);
  const customer = await bundle('./src/components/account/BrowserPushPreferences.tsx', false);
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [320,390,768,1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], writes = []; let uploads=0; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => {
        const req = route.request();
        if (new URL(req.url()).pathname === '/admin/push-notifications/images') {
          uploads++;assert(req.headers()['content-type'].includes('multipart/form-data'));
          return route.fulfill({status:uploads===1?200:503,contentType:'application/json',body:JSON.stringify(uploads===1?{image:{url:'https://qa-bucket.s3.ap-south-1.amazonaws.com/notifications/2026/11/03/fixture.png'}}:{error:'Fixture upload unavailable'})});
        }
        if (new URL(req.url()).pathname === '/admin/push-notifications/customers') {
          const params=new URL(req.url()).searchParams,size=Math.min(100,Number(params.get('limit')||25)),offset=Number(params.get('offset')||0);
          const rows=Array.from({length:120},(_,i)=>({id:'cus_fixture'+i,email:'customer'+i+'@example.test',first_name:'Customer',last_name:String(i),devices:1}));
          if(params.get('eligible')!=='true')rows.push({id:'cus_unsubscribed',email:'unsubscribed@example.test',first_name:'Unsubscribed',last_name:'Customer',devices:0});
          const matches=rows.filter(c=>(c.email+' '+c.first_name+' '+c.last_name).toLowerCase().includes((params.get('q')||'').toLowerCase()));
          return route.fulfill({contentType:'application/json',body:JSON.stringify({customers:matches.slice(offset,offset+size),total:matches.length})});
        }
        if (new URL(req.url()).pathname === '/admin/push-notifications') {
          if (req.method() === 'POST') { const body = req.postDataJSON(); writes.push(body); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaign: { ...campaign, ...body.campaign } }) }) }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ campaigns: [campaign], configured: true, enabled: true, subscribers: 5, total: 1 }) });
        }
        return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      });
      await page.goto('http://push-fixture.test/');
      await page.addStyleTag({ content: `*{box-sizing:border-box}body{margin:0;font-family:Arial}${admin.outputFiles.find(f=>f.path.endsWith('.css')).text}` });
      await page.addScriptTag({ content: admin.outputFiles.find(f=>f.path.endsWith('.js')).text });
      await page.getByText('5 opted-in browsers').waitFor();
      const logo = page.getByRole('img',{name:'OWEG',exact:true});
      await logo.waitFor();
      const logoBox=await logo.boundingBox();assert(logoBox.width===76&&logoBox.height===22);
      assert.equal(writes.length, 0);
      // History can be several screens below the editor. Details must reveal it,
      // including when the same draft is reopened, without saving or sending.
      for(let attempt=0;attempt<2;attempt++){
        await page.getByRole('heading',{name:'Campaign history',exact:true}).scrollIntoViewIfNeeded();
        await page.getByRole('button',{name:'Details',exact:true}).click();
        const heading=page.getByRole('heading',{name:'Notification details',exact:true});
        await heading.waitFor();
        await page.waitForFunction(()=>document.activeElement?.textContent==='Notification details');
        const box=await heading.boundingBox();assert(box.y>=0&&box.y<900,'Details did not reveal editor at '+width);
        assert.equal(await page.getByLabel(/Title/).inputValue(),campaign.title);
        await page.getByText('Draft — not sent',{exact:true}).waitFor();assert.equal(writes.length,0);
      }
      await page.getByRole('button',{name:'New notification',exact:true}).click();
      await page.getByLabel(/Title/).fill('A little treat ✨');
      await page.getByLabel(/Message/).fill('A customer-first fixture message');
      const uploadInput=page.getByLabel('Upload campaign image',{exact:true});
      await uploadInput.setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0])});
      await page.getByText('Image uploaded. Save the draft to keep it.',{exact:true}).waitFor();
      const imageUrl=await page.getByLabel('Optional image URL or storefront path',{exact:true}).inputValue();assert(imageUrl.includes('/notifications/2026/11/03/'));
      await uploadInput.setInputFiles({name:'second.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0])});
      await page.getByText('Fixture upload unavailable',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('Optional image URL or storefront path',{exact:true}).inputValue(),imageUrl);
      await page.getByRole('button',{name:'Save draft',exact:true}).click();
      await page.getByText('Select at least one opted-in customer, or explicitly choose All opted-in browsers.',{exact:true}).waitFor();
      assert.equal(writes.length,0);
      await page.getByRole('button',{name:'Select first 50 matching',exact:true}).click();
      await page.getByText('50 customers selected',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Select first 100 matching',exact:true}).click();
      await page.getByText('100 customers selected',{exact:true}).waitFor();
      await page.getByRole('checkbox').first().uncheck();
      await page.getByText('99 customers selected',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Select all matching subscribed',exact:true}).click();
      await page.getByText('120 customers selected',{exact:true}).waitFor();
      await page.getByLabel('Search customers',{exact:true}).fill('unsubscribed@example.test');
      await page.getByText(/Not subscribed — browser permission required/).waitFor();
      assert(await page.getByRole('checkbox').isDisabled());assert(await page.getByRole('button',{name:'Use for test',exact:true}).isDisabled());
      assert.equal(writes.length,0);
      await page.getByLabel('Search customers',{exact:true}).fill('');
      await page.getByRole('button',{name:'Clear selection',exact:true}).click();
      await page.getByText('0 customers selected',{exact:true}).waitFor();
      await page.locator('select').first().selectOption('all');
      await page.getByRole('button',{name:'Save draft',exact:true}).click();
      await page.getByText('Draft saved.',{exact:true}).waitFor();
      assert.equal(writes.length,1);
      await page.getByLabel(/Message/).fill('Edited fixture for save-before-confirm');
      await page.getByRole('button',{name:'Review & send',exact:true}).click();
      await page.getByRole('button',{name:'Confirm send',exact:true}).waitFor();
      assert.equal(await page.getByRole('alert').evaluate(el=>el===document.activeElement),true);
      assert.equal(writes.length,2);assert.equal(writes[1].action,'save'); // A preview click never sends without confirmation.
      await page.getByRole('button',{name:'Go back',exact:true}).click();
      await page.getByRole('button',{name:'Review & send',exact:true}).click();
      await page.getByRole('button',{name:'Confirm send',exact:true}).click();
      await page.getByText(/Queued. The background job/).waitFor();
      assert.deepEqual(writes.map(w=>w.action),['save','save','send']);
      await page.getByRole('button',{name:'Desktop',exact:true}).click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `admin overflow at ${width}`);
      await page.getByRole('button',{name:'Mobile',exact:true}).click();
      if(process.env.PUSH_QA_SCREENSHOTS && [390,1280].includes(width)) await page.screenshot({ path: path.join(process.env.PUSH_QA_SCREENSHOTS,`oweg-push-admin-${width}.png`), fullPage:true });
      assert.deepEqual(errors,[]); await page.close();
    }
    for (const mode of ["installed", "error", "tab"]) {
      const fail = mode === "error";
      const page=await browser.newPage({viewport:{width:390,height:844}});let writes=0;
      await page.route('**/*',route=>{
        if(new URL(route.request().url()).pathname.startsWith('/api/')){
          if(route.request().method()==='POST'){assert.equal(route.request().postDataJSON().installed_app,true);writes++;return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:'Fixture unavailable'}:{active:true})})}
          return route.fulfill({contentType:'application/json',body:JSON.stringify({configured:true,customer_id:'cus_test',active:writes>0&&!fail,publicKey:'B'.repeat(87)})});
        }
        return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
      });
      await page.goto('http://localhost:34567/');
      await page.evaluate((standalone)=>{
        Object.defineProperty(navigator,'standalone',{value:standalone});window.permissionCalls=0;window.unsubscribed=0;window.nativeChecks=0;window.qaSubscription=null;
        Object.defineProperty(window,'PushManager',{value:class{}});
        Object.defineProperty(window,'Notification',{value:{permission:'granted',requestPermission:()=>{window.permissionCalls++;return Promise.resolve('granted')}}});
        const sub={endpoint:'https://fcm.googleapis.com/fcm/send/qa',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/qa',expirationTime:null,keys:{p256dh:'test',auth:'test'}}),unsubscribe:async()=>{window.unsubscribed++;return true}};
        Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>({active:true,pushManager:{getSubscription:async()=>window.qaSubscription,subscribe:async()=>{window.qaSubscription=sub;return sub}},showNotification:async()=>{window.nativeChecks++},getNotifications:async()=>[{}]})}});
      }, mode !== 'tab');
      await page.addScriptTag({content:customer.outputFiles.find(f=>f.path.endsWith('.js')).text});
      if(mode === 'tab'){
        await page.getByText(/Open the installed OWEG app/).waitFor();
        assert.equal(await page.getByRole('radio').count(),0);
        assert.equal(await page.evaluate(()=>window.permissionCalls),0);
        assert.equal(writes,0);
        await page.close();
        continue;
      }
      const enable=page.getByRole('radio',{name:'Allow product updates',exact:true});await enable.waitFor();
      assert.equal(await page.evaluate(()=>window.permissionCalls),0);
      await enable.click();
      if(fail) await page.getByText('Fixture unavailable',{exact:true}).waitFor(); else await page.waitForFunction(()=>document.querySelector('input[type=radio]')?.checked);
      assert.equal(writes,1); assert.equal(await page.evaluate(()=>window.permissionCalls),0);
      assert.equal(await page.evaluate(()=>window.unsubscribed),fail?1:0);
      if(!fail){
        const off=page.getByRole('radio',{name:'Don’t allow notifications'});
        await off.click();
        await page.waitForFunction(()=>document.querySelectorAll('input[type=radio]')[1]?.checked);
        assert.equal(await page.evaluate(()=>window.unsubscribed),1);
        assert.equal(writes,1);
      }

      await page.close();
    }
    console.log('PASS responsive admin 320/390/768/1280, draft/confirmation boundary, no automatic sends, customer explicit consent and rollback on failure.');
  }finally{await browser.close()}
  // Isolated product delivery fixture with the built storefront's actual utility CSS.
  const delivery=await bundle('./src/app/productDetail/components/DeliveryInfo.tsx',false,'pinCode="401105" pinStatus="idle" pinMessage="Bhayander East, Thane, Maharashtra. Postal area found; courier serviceability and delivery estimate are confirmed at checkout when available." onPinCodeChange={()=>{}} onCheck={()=>{document.body.dataset.checked="true"}}');
  const cssRoot=path.resolve('.next/static');
  const utilityCss=fs.readdirSync(cssRoot,{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join(cssRoot,p),'utf8')).join('\n');
  const deliveryBrowser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{for(const width of [320,360,390,642,768,1280]){
    const page=await deliveryBrowser.newPage({viewport:{width,height:900}});
    page.on('pageerror',e=>console.error('Delivery fixture error:',e.message));
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://delivery-fixture.test/');
    await page.addStyleTag({content:utilityCss+'\n'+delivery.outputFiles.find(p=>p.path.endsWith('.css')).text+'\nbody{margin:0}#root{max-width:600px;padding:16px;margin:auto;box-sizing:border-box}'});
    await page.addScriptTag({content:delivery.outputFiles.find(p=>p.path.endsWith('.js')).text});
    const input=page.getByLabel('Delivery pincode'),button=page.getByRole('button',{name:'Check area',exact:true});
    await button.waitFor();
    const a=await input.boundingBox(),b=await button.boundingBox();assert(a.height>=44&&b.height>=44);assert(a.x>=0&&b.x+b.width<=width);assert(a.y+a.height<=b.y||a.x+a.width<=b.x);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'delivery overflow '+width);
    await button.click();assert.equal(await page.locator('body').getAttribute('data-checked'),'true');
    await page.close();
  }}finally{await deliveryBrowser.close()}
  console.log('PASS delivery pincode layout/touch targets at 320/360/390/642/768/1280, no overflow and submit preserved.');
  const profile=await bundle('./src/components/mobile/MobileProfileSheet.tsx',false,'customer={{id:"cus_test"}} customerName="Test customer" deliverLocation="401107" onClose={()=>{window.qaMenuClosed=true}} onLogin={()=>{}} onSignup={()=>{}} onSignOut={()=>{}}');
  const promptBrowser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const menu=await promptBrowser.newPage({viewport:{width:390,height:844}});await menu.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await menu.goto('http://profile-fixture.test/');await menu.addStyleTag({content:utilityCss});await menu.addScriptTag({content:profile.outputFiles.find(p=>p.path.endsWith('.js')).text});const link=menu.getByRole('link',{name:'Notifications',exact:true});assert.equal(await link.getAttribute('href'),'/account/notifications');await link.evaluate(el=>el.addEventListener('click',e=>e.preventDefault()));await link.click();assert.equal(await menu.evaluate(()=>window.qaMenuClosed),true);await menu.close();
    console.log('PASS mobile notification settings link.');
  }finally{await promptBrowser.close()}

  const inboxBundle=await bundle('./src/components/account/NotificationInbox.tsx',false);
  const inboxBrowser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    for(const width of [320,390,768,1280]){
      const page=await inboxBrowser.newPage({viewport:{width,height:844}});let fail=false;
      await page.route('**/*',route=>{
        if(route.request().url().includes('/api/medusa/push-inbox')){
          if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'})}
          const second=route.request().url().includes('offset=20');
          return route.fulfill({contentType:'application/json',body:JSON.stringify({notifications:[{id:second?'older':'latest',title:second?'Older update':'Diwali offer',body:'Your saved update '.repeat(15),url:'/flash-sale',image:null,sent_at:new Date().toISOString(),expired:second}],has_more:!second})})
        }
        return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})
      });
      await page.goto('http://inbox-fixture.test/notifications');
      await page.addStyleTag({content:inboxBundle.outputFiles.find(p=>p.path.endsWith('.css')).text});
      await page.addScriptTag({content:inboxBundle.outputFiles.find(p=>p.path.endsWith('.js')).text});
      await page.getByRole('heading',{name:'Diwali offer'}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'inbox overflow '+width);
      assert.equal(await page.getByRole('link',{name:'Settings',exact:true}).getAttribute('href'),'/account/notifications');
      fail=true;await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('alert').waitFor();
      await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('heading',{name:'Older update'}).waitFor();
      await page.getByText('Offer ended',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'View update'}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Previous',exact:true}).click();await page.getByRole('heading',{name:'Diwali offer'}).waitFor();
      await page.close();
    }
    console.log('PASS customer inbox: responsive layouts, isolated feed, pagination, error retry, expired offer and separate settings.');
  }finally{await inboxBrowser.close()}

  // Execute the real worker listeners with a fake Serwist/browser environment.
  const events={},notifications=[],opened=[];
  const self={location:{origin:'https://www.0weg.in'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(...args)=>notifications.push(args)},clients:{matchAll:async()=>[{url:'https://www.0weg.in/checkout',focus:async()=>{throw new Error('Must not steal checkout')}}],openWindow:async url=>opened.push(url)}};
  let tracking=0;
  const compiled=ts.transpileModule(fs.readFileSync('src/sw.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{exports:{},require:name=>name.includes('@serwist')?{defaultCache:[]}:{NetworkOnly:class{},Serwist:class{addEventListeners(){}}},self,URL,AbortSignal,fetch:async()=>{tracking++;throw new Error('Simulated offline tracking')},caches:{},console});
  let pending;events.push({data:{json:()=>({title:'Fixture',body:'Message',url:'//evil.test',image:'//evil.test',tag:'stable'})},waitUntil:p=>pending=p});await pending;
  assert.equal(notifications[0][1].data.url,'/');assert.equal(notifications[0][1].image,undefined);
  events.notificationclick({notification:{close(){},data:{url:'/flash-sale'}},waitUntil:p=>pending=p});await pending;
  assert.deepEqual(opened,['https://www.0weg.in/flash-sale']);
  events.notificationclick({notification:{close(){},data:{url:'/flash-sale',clickToken:campaign.id}},waitUntil:p=>pending=p});await pending;
  assert.equal(tracking,1);assert.equal(opened.length,2); // Failed analytics never prevents navigation.
  console.log('PASS worker safe destination, visible notification, stable tag and checkout-tab preservation.');
})().catch(error=>{console.error(error);process.exitCode=1});
