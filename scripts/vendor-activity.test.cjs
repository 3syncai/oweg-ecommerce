const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const ts=require('typescript'), fs=require('node:fs');
function load(file,mocks={},env={}){
  const result={};
  new Function('exports','require','process',ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:1,target:9,esModuleInterop:true}
  }).outputText)(result,id=>mocks[id]??require(id),{env});
  return result;
}
test('verified login, foreground navigation and writes update only the authenticated account', {skip:!process.env.PGLITE_MODULE}, async()=>{
  const {PGlite}=require(process.env.PGLITE_MODULE);
  const db=new PGlite();
  try {
    const secret={VENDOR_ACTIVITY_PROXY_SECRET:'local-test-only',VENDOR_ACTIVITY_CLIENT_IP_HEADER:'x-ingress-client'};
    const signer=load('vendor-portal/lib/activity-ip.ts',{},secret);
    const context=load('my-medusa-store/src/lib/admin-access/activity-context.ts');
    const rate=load('my-medusa-store/src/lib/simple-rate-limit.ts');
    const service=load('my-medusa-store/src/lib/vendor-user-activity.ts',{'./db-pool':{getSharedDbPool:()=>db},
      './admin-access/activity-context':context,'./simple-rate-limit':rate},secret);
    await db.exec("create table vendor_user(id text primary key,vendor_id text,email text,deleted_at timestamptz); insert into vendor_user values ('u1','s','a',null),('u2','s','b',null)");
    let ddl;
    const migration=load('my-medusa-store/src/modules/vendor/migrations/Migration20261123000001.ts',{'@medusajs/framework/mikro-orm/migrations':{Migration:class{addSql(statement){ddl=statement}}}});
    await new migration.Migration20261123000001().up();
    await db.exec(ddl);
    const headers=ip=>signer.portalActivityHeaders(new Headers({'x-ingress-client':ip}));
    const req={body:{email:'qa',password:'fixture'},headers:headers('192.0.2.11'),socket:{remoteAddress:'127.0.0.1'}};
    assert.equal(service.vendorActivityIp({...req,headers:{...req.headers,'x-oweg-activity-ip':'192.0.2.55'}}),null);
    assert.equal(service.vendorActivityIp({...req,headers:{'x-forwarded-for':'192.0.2.55'}}),'127.0.0.1');
    const accounts=()=>service.vendorAccountActivity('s');
    for(const [index,dir] of ['auth/login','login'].entries()){
      const user={id:'u'+(index+1),vendor_id:'s'};
      const base=index?'../../../':'../../../../';
      const route=load('my-medusa-store/src/api/vendor/'+dir+'/route.ts',{
        [base+'modules/vendor']:{},[base+'lib/vendor-user-activity']:service,[base+'lib/simple-rate-limit']:rate,
        [(index?'../':'../../')+'_lib/token']:{signVendorToken:()=>'test'}
      });
      const auth={authenticateVendorUser:async()=>{throw new Error('invalid')},listVendors:async()=>[]};
      req.scope={resolve:()=>auth};
      await assert.rejects(route.POST(req,{json:x=>x}),/invalid/);
      assert.equal((await accounts())[index].login_at,null);
      auth.authenticateVendorUser=async()=>user;
      const loginResponse = new EventEmitter();
      loginResponse.json = x => { loginResponse.emit('finish'); return x };
      await route.POST(req,loginResponse);
    }
    const first=(await accounts())[0];
    assert.equal(first.login_ip,'192.0.2.11');
    await service.recordVendorActivity(req,'u1');
    assert.equal(String((await accounts())[0].activity_at),String(first.activity_at));
    req.headers={...headers('2001:db8::9'),authorization:'Bearer existing'};
    const middleware=load('my-medusa-store/src/api/vendor/_lib/require-vendor-bearer.ts',{
      '../../../lib/vendor-user-activity':service,'./token':{verifyVendorToken:async()=>({sub:'u1',vendor_id:'s'})}
    });
    const res=new EventEmitter();res.statusCode=204;
    await middleware.requireVendorBearerMiddleware({...req,url:'/vendor/pulse',method:'GET'},res,()=>{});
    assert.equal(res.listenerCount('finish'),0);
    await middleware.requireVendorBearerMiddleware({...req,url:'/vendor/activity',method:'POST'},res,()=>{});
    res.emit('finish');
    const [a,b]=await accounts();
    assert.equal(a.login_ip,'192.0.2.11');assert.equal(a.activity_ip,'2001:db8::9');assert.equal(b.activity_ip,'192.0.2.11');
    const nav=load('my-medusa-store/src/api/vendor/activity/route.ts',{'../../../lib/simple-rate-limit':rate});
    const out={set(){return this},sendStatus(n){return n},status(n){this.code=n;return this},end(){return this.code}};
    for(let i=0;i<30;i++)assert.equal(nav.POST({vendor_auth:{sub:'u1'}},out),204);
    assert.equal(nav.POST({vendor_auth:{sub:'u1'}},out),429);
    await db.exec('drop table vendor_user_activity');
    await service.recordVendorActivity(req,'u1',true);
  } finally {await db.close()}
});
