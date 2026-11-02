// Isolated policy regression; no provider calls or database changes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(env={}) {
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/security-headers.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,process:{env:{NODE_ENV:'production',...env}},URL});
 return exports;
}
test('legacy vendor image host is permitted for images and service-worker fetches',()=>{
 const policy=load();assert(policy.getAllowedImageHosts().includes('cdn.storehippo.com'));
 const csp=policy.buildContentSecurityPolicy().split(';').map(s=>s.trim());
 for(const directive of ['img-src','connect-src'])assert(csp.find(s=>s.startsWith(directive+' ')).split(' ').includes('https://cdn.storehippo.com'));
});
test('image origin fix retains existing buckets and strict unrelated directives',()=>{
 const policy=load({S3_BUCKET:'qa-bucket',S3_REGION:'ap-south-1'});const csp=policy.buildContentSecurityPolicy();
 assert(policy.getAllowedImageHosts().includes('qa-bucket.s3.ap-south-1.amazonaws.com'));
 assert(csp.includes("object-src 'none'"));assert(csp.includes("frame-ancestors 'none'"));
 assert(!csp.split(';').find(s=>s.trim().startsWith('img-src ')).split(' ').includes('*'));
});
test('Next image configuration shares the same allowlist as CSP',()=>{
 const source=fs.readFileSync(path.join(root,'next.config.ts'),'utf8');
 assert.match(source,/for \(const hostname of getAllowedImageHosts\(\)\)/);
 assert.match(source,/remotePatterns: buildRemotePatterns\(\)/);
});
