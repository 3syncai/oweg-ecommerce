// Isolated browser fixtures. All requests are intercepted; no live sends or logins.
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function bundle(entry, unused, props = '') {
  return esbuild.build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Component from '${entry}';createRoot(document.getElementById('root')).render(<Component ${props}/>);` },
    bundle: true, write: false, outdir: 'qa', format: 'iife', jsx: 'automatic', loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-boundaries', setup(b) {
      b.onResolve({ filter: /(@medusajs\/(admin-sdk|icons)|with-admin-page-access|admin-backend$|admin-auth-fetch$|^next\/link$)/ }, a => ({ path: a.path, namespace: 'qa' }));
      b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ loader: 'js', contents: a.path === 'next/link' ? "import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}" : a.path.includes('admin-sdk') ? 'export const defineRouteConfig=x=>x;' : a.path.includes('icons') ? 'export const BellAlert=()=>null;' : a.path.includes('with-admin-page-access') ? 'export const withAdminPageAccess=x=>x;' : a.path.includes('admin-backend') ? "export const getAdminBackendUrl=()=>'';" : 'export const getAdminAuthHeaders=x=>new Headers(x);' }));
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
      const errors = [], writes = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => {
        const req = route.request();
        if (new URL(req.url()).pathname === '/admin/push-notifications/customers') {
          const size=Math.min(100,Number(new URL(req.url()).searchParams.get('limit')||25));
          return route.fulfill({contentType:'application/json',body:JSON.stringify({customers:Array.from({length:size},(_,i)=>({id:'cus_fixture'+i,email:'customer'+i+'@example.test',first_name:'Customer',last_name:String(i),devices:1})),total:120})});
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
      assert(await page.getByRole('button',{name:'Send now',exact:true}).isDisabled());
      await page.getByLabel(/Title/).fill('A little treat ✨');
      await page.getByLabel(/Message/).fill('A customer-first fixture message');
      await page.getByRole('button',{name:'Save draft',exact:true}).click();
      await page.getByText('Select at least one opted-in customer, or explicitly choose All opted-in browsers.',{exact:true}).waitFor();
      assert.equal(writes.length,0);
      await page.getByRole('button',{name:'Select first 50 matching',exact:true}).click();
      await page.getByText('50/100 customers selected',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Select first 100 matching',exact:true}).click();
      await page.getByText('100/100 customers selected',{exact:true}).waitFor();
      await page.getByRole('checkbox').first().uncheck();
      await page.getByText('99/100 customers selected',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Clear selection',exact:true}).click();
      await page.getByText('0/100 customers selected',{exact:true}).waitFor();
      await page.locator('select').first().selectOption('all');
      await page.getByRole('button',{name:'Save draft',exact:true}).click();
      await page.getByText('Draft saved.',{exact:true}).waitFor();
      assert.equal(writes.length,1);
      await page.getByRole('button',{name:'Send now',exact:true}).click();
      assert.equal(writes.length,1); // A preview click never sends without confirmation.
      await page.getByRole('button',{name:'Go back',exact:true}).click();
      await page.getByRole('button',{name:'Desktop',exact:true}).click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `admin overflow at ${width}`);
      await page.getByRole('button',{name:'Mobile',exact:true}).click();
      if(process.env.PUSH_QA_SCREENSHOTS && [390,1280].includes(width)) await page.screenshot({ path: path.join(process.env.PUSH_QA_SCREENSHOTS,`oweg-push-admin-${width}.png`), fullPage:true });
      assert.deepEqual(errors,[]); await page.close();
    }
    for (const fail of [false,true]) {
      const page=await browser.newPage({viewport:{width:390,height:844}});let writes=0;
      await page.route('**/*',route=>{
        if(new URL(route.request().url()).pathname.startsWith('/api/')){
          if(route.request().method()==='POST'){writes++;return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:'Fixture unavailable'}:{active:true})})}
          return route.fulfill({contentType:'application/json',body:JSON.stringify({configured:true,publicKey:'B'.repeat(87)})});
        }
        return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
      });
      await page.goto('http://localhost:34567/');
      await page.evaluate(()=>{
        window.permissionCalls=0;window.unsubscribed=0;window.nativeChecks=0;
        Object.defineProperty(window,'PushManager',{value:class{}});
        Object.defineProperty(window,'Notification',{value:{permission:'granted',requestPermission:()=>{window.permissionCalls++;return Promise.resolve('granted')}}});
        const sub={endpoint:'https://fcm.googleapis.com/fcm/send/qa',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/qa',expirationTime:null,keys:{p256dh:'test',auth:'test'}}),unsubscribe:async()=>{window.unsubscribed++;return true}};
        Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>({active:true,pushManager:{getSubscription:async()=>null,subscribe:async()=>sub},showNotification:async()=>{window.nativeChecks++},getNotifications:async()=>[{}]})}});
      });
      await page.addScriptTag({content:customer.outputFiles.find(f=>f.path.endsWith('.js')).text});
      const enable=page.getByRole('button',{name:'Enable notifications',exact:true});await enable.waitFor();
      assert.equal(await page.evaluate(()=>window.permissionCalls),0);
      await enable.click();
      await page.getByText(fail?'Fixture unavailable':'You’re subscribed to OWEG offers and updates on this browser.',{exact:true}).waitFor();
      assert.equal(writes,1); assert.equal(await page.evaluate(()=>window.permissionCalls),1);
      assert.equal(await page.evaluate(()=>window.unsubscribed),fail?1:0);
      if(!fail){await page.getByRole('button',{name:'Test notification on this device',exact:true}).click();await page.getByText(/Your browser created the test notification/).waitFor();assert.equal(await page.evaluate(()=>window.nativeChecks),1);assert.equal(writes,1);}
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
