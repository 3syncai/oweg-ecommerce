// Actual Header and styles; external services and unrelated widgets mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/jhakr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const bundle=await esbuild.build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import Header from'./src/app/header/Header';createRoot(document.getElementById('root')).render(<><Header/><main id="outside" style={{paddingTop:'var(--app-header-height,180px)',height:2400,background:'#efd8ac'}}>Hero poster fixture</main></>);`},bundle:true,write:false,outdir:'qa',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){
b.onResolve({filter:/^(next\/(link|image|navigation)|@\/components\/|@\/contexts\/|@\/hooks\/useStoreCategories|@\/lib\/mega-menu-banner-cache)/},a=>({path:a.path,namespace:'qa'}));
b.onResolve({filter:/^[^./]/},a=>a.path.startsWith('@/')?undefined:({path:require.resolve(a.path,{paths:[process.cwd()]})}));
b.onLoad({filter:/.*/,namespace:'qa'},a=>({loader:'jsx',contents:
a.path==='next/navigation'?`const router={push:p=>window.destination=p,prefetch(){}};export const useRouter=()=>router,usePathname=()=>'/';`:
a.path==='next/link'?`import React from'react';export default function Link({href,children,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);e.preventDefault();window.destination=href}}>{children}</a>}`:
a.path==='next/image'?`import React from'react';export default function Image({fill,priority,sizes,...props}){return <img {...props}/ >}`:
a.path.endsWith('CartProvider')?`export const useCartSummary=()=>({count:0,refresh(){}});`:
a.path.endsWith('AuthProvider')?`export const useAuth=()=>({customer:null,initializing:false});`:
a.path.endsWith('useStoreCategories')?`const data=[];export const useStoreCategories=()=>({data,isPending:false,isFetching:false,isFetched:true});`:
a.path.endsWith('mega-menu-banner-cache')?`export const prefetchMegaMenuBanners=()=>{},prefetchMegaMenuBannersForCategories=()=>{};`:
a.path.endsWith('/input')?`import React from'react';export const Input=React.forwardRef((p,r)=><input ref={r} {...p}/>);`:
a.path.endsWith('/button')?`import React from'react';export const Button=({children,...p})=><button {...p}>{children}</button>;`:
`export default function Widget(){return null}`
}));}}]});
// Use the production Tailwind utility output, plus the freshly bundled CSS module.
const cssDir='.next/static/css';assert(fs.existsSync(cssDir),'Run npm run build once to generate Tailwind utilities for this browser fixture.');
const utilityCss=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n');
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390,563,768,1280]){
 const page=await browser.newPage({viewport:{width,height:742},hasTouch:width<768});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.pathname==='/api/search'){const rows=u.searchParams.get('q')==='none'?[]:Array.from({length:8},(_,i)=>({id:'p'+i,title:'QA Mouse '+i,handle:'qa-mouse-'+i}));return r.fulfill({contentType:'application/json',body:JSON.stringify({products:rows})})}if(u.pathname.startsWith('/api/'))return r.fulfill({contentType:'application/json',body:'{}'});return r.fulfill({contentType:'text/html',body:'<div id="root"></div>'})});
 try{await page.goto('http://header.test/');await page.addStyleTag({content:utilityCss+'\n'+css});await page.addScriptTag({content:js});
 const input=page.locator('input[aria-label="Search products"]:visible');await input.fill('mouse');
 const panel=page.locator('[role="listbox"]:visible');await panel.getByRole('option').last().waitFor();await page.waitForTimeout(350);
 const rect=await panel.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);assert(rect.y+rect.height<742);
 const point={x:rect.x+rect.width/2,y:rect.y+Math.min(rect.height-5,65)};
 assert(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[role="listbox"]'),point),'suggestions must be hit-testable above the hero, not clipped');
 if(width<768){assert.equal(await page.locator('[data-search-expanded="true"]').evaluate(n=>getComputedStyle(n).overflow),'visible');
   await panel.evaluate(n=>n.scrollTop=n.scrollHeight);assert(await panel.evaluate(n=>n.scrollTop>0));
 }
 await panel.getByRole('option',{name:'QA Mouse 7',exact:true}).click();assert.match(await page.evaluate(()=>window.destination),/qa-mouse-7\?id=p7/);
 assert.equal(await page.locator('[role="listbox"]:visible').count(),0);
 await input.fill('none');await panel.getByText('No products found',{exact:true}).waitFor();
 assert(await panel.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+20,r.top+20))}));
 await input.click();assert.equal(await panel.count(),1,'clicking inside mobile search must not dismiss suggestions');
 await page.mouse.click(width-2,700);assert.equal(await page.locator('[role="listbox"]:visible').count(),0);
 await input.fill('mouse');await panel.getByRole('option').first().waitFor();await input.press('Enter');assert.match(await page.evaluate(()=>window.destination),/^\/search\?/);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: results above poster, scroll/touch selection, empty state, inside/outside clicks and Enter search`);
 }finally{await page.close()}
}}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
