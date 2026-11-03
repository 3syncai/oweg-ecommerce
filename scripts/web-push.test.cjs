// Actual PostgreSQL SQL + real route/dispatcher code; no DATABASE_URL or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const backend = createRequire(path.resolve('my-medusa-store/package.json'));
const { PGlite } = require(process.env.PGLITE_MODULE || path.join(os.tmpdir(), 'oweg-push-postgres-qa/node_modules/@electric-sql/pglite'));
const keys = backend('web-push').generateVAPIDKeys();
const env = { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:test@example.com', WEB_PUSH_ENABLED: 'true' };
let db, send, networkCalls = 0;
const imageUploads = [];
let uploadFails = false;
const pool = { query: (...args) => db.query(...args), connect: async () => ({ query: async (sql, args) => {
  if (sql.includes('pg_try_advisory_lock') || sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
  if (sql.includes('pg_advisory_unlock')) return { rows: [] };
  return db.query(sql, args);
}, release() {} }) };
const cache = {};
function load(file) {
  const absolute = path.resolve('my-medusa-store/src', file);
  if (cache[absolute]) return cache[absolute].exports;
  const mod = { exports: {} }; cache[absolute] = mod;
  const requireMock = name => {
    if (name.endsWith('/db-pool')) return { getSharedDbPool: () => pool };
    if (name === '@aws-sdk/client-s3') return { S3Client: class { async send(command) { if(uploadFails)throw new Error('Mock transport failure'); imageUploads.push(command.input); return {} } destroy() {} }, PutObjectCommand: class { constructor(input) { this.input=input } }, GetObjectCommand: class {} };
    if (name === 'web-push') return { sendNotification: (...args) => { networkCalls++; return send(...args) } };
    if (name.startsWith('.')) return load(path.relative(path.resolve('my-medusa-store/src'), path.resolve(path.dirname(absolute), name + '.ts')));
    return backend(name);
  };
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { require: requireMock, module: mod, exports: mod.exports, process: { env }, Buffer, URL, console, Date, AbortSignal });
  return mod.exports;
}
const validation = load('lib/web-push/validation.ts');
const service = load('lib/web-push/service.ts');
const admin = load('api/admin/push-notifications/route.ts');
const customer = load('api/store/push-subscriptions/route.ts');
const clicks = load('api/store/push-clicks/route.ts');
const inbox = load('api/store/push-inbox/route.ts');
function response() { return { code: 200, value: null, setHeader() {}, end() { return this }, status(code) { this.code = code; return this }, json(value) { this.value = value; return this } } }
async function call(fn, body, actor = 'cus_test', query = {}) { const res = response(); await fn({ body, query, auth_context: actor ? { actor_id: actor } : undefined }, res); return res }
const subscription = n => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test${n}`, keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, n).toString('base64url') } });
const campaign = () => ({ title: 'A real fixture', body: 'No live sends', url: '/flash-sale', image: '', audience: [], expires_at: new Date(Date.now() + 86400000).toISOString() });

test('push validation rejects SSRF, external links, malformed keys and invalid schedules', () => {
  for (const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:9000/a']) assert.equal(validation.safeEndpoint(endpoint), false);
  for (const url of ['//evil.test','/\\evil.test','/%2fexample.com','https://evil.test','/%0Aevil']) assert.equal(validation.safeDestination(url), false);
  assert.equal(validation.safeDestination('/productDetail/fixture?id=123'), true);
  assert.equal(validation.subscriptionSchema.safeParse(subscription(1)).success, true);
  assert.equal(validation.subscriptionSchema.safeParse({ ...subscription(1), keys: { auth: 'bad', p256dh: 'bad' } }).success, false);
  assert.equal(validation.campaignSchema.safeParse({ ...campaign(), expires_at: 'yesterday' }).success, false);
  assert.equal(validation.retryDelay(5), 480);
  assert.equal(validation.safeImage('https://untrusted.test/tracking.png'), false);
  assert.equal(validation.safeImage('/page-banners/offer.webp'), true);
});

test('migration repeat safety; consent, ownership, draft revision and queue recovery on isolated PostgreSQL', async () => {
  db = new PGlite();
  try {
    // Embedded PG has no multi-session advisory locks; only these are stubbed.
    const sql = fs.readFileSync('my-medusa-store/migrations/web-push.sql', 'utf8').replace('SELECT pg_advisory_xact_lock(74638291);', '');
    await db.exec(sql); await db.exec(sql);
    await db.exec("CREATE TABLE customer(id text PRIMARY KEY,deleted_at timestamptz);INSERT INTO customer VALUES('cus_test',NULL),('cus_other',NULL)");
    assert.equal((await call(customer.POST, subscription(1), null)).code, 401);
    assert.equal((await call(customer.POST, {...subscription(1),expected_customer_id:'cus_other'})).code,409);
    assert.equal((await call(customer.POST, subscription(1))).code, 200);
    assert.equal((await call(customer.POST, subscription(1), 'cus_other')).code, 409);
    assert.equal((await call(customer.DELETE, { endpoint: subscription(1).endpoint }, 'cus_other')).code, 200);
    assert.equal((await db.query('SELECT active FROM oweg_push_subscription')).rows[0].active, true);
    assert.equal((await call(customer.GET, null, 'cus_other', { endpoint: subscription(1).endpoint })).value.active, false);
    const saved = await call(admin.POST, { action: 'save', campaign: campaign() }, 'user_admin');
    const c = saved.value.campaign;
    assert.equal(c.status, 'draft');
    assert.equal((await call(inbox.GET,null)).value.notifications.length,0);
    const edited = await call(admin.POST, { action: 'save', id: c.id, revision: 1, campaign: { ...campaign(), title: 'Edited' } });
    assert.equal(edited.value.campaign.revision, 2);
    assert.equal((await call(admin.POST, { action: 'send', id: c.id, revision: 1 })).code, 409);
    assert.equal((await call(admin.POST, { action: 'schedule', id: c.id, revision: 2, scheduled_at: new Date(Date.now() - 1000).toISOString() })).code, 400);
    assert.equal((await call(admin.POST, { action: 'send', id: c.id, revision: 2 })).code, 200);
    assert.equal((await call(admin.POST, { action: 'send', id: c.id, revision: 2 })).code, 409);
    assert.equal((await call(admin.POST, { action: 'save', id: c.id, revision: 3, campaign: campaign() })).code, 409);
    send = async (s, payload) => { assert.equal(s.endpoint, subscription(1).endpoint); assert.equal(JSON.parse(payload).title, 'Edited') };
    await service.dispatchPushBatch(); await service.dispatchPushBatch();
    assert.equal(networkCalls, 1);
    assert.equal((await db.query('SELECT status FROM oweg_push_campaign WHERE id=$1', [c.id])).rows[0].status, 'completed');
    assert.equal((await db.query('SELECT status FROM oweg_push_delivery')).rows[0].status, 'accepted');
    assert.equal((await call(inbox.GET,null,null)).code,401);
    assert.equal((await call(inbox.GET,null,'cus_test',{offset:'-1'})).code,400);
    const ownInbox = await call(inbox.GET,null);
    assert.equal(ownInbox.value.notifications.length,1);
    assert.equal(ownInbox.value.notifications[0].id,c.id);
    assert.equal((await call(inbox.GET,null,'cus_other')).value.notifications.length,0);
    assert.equal((await call(inbox.GET,null,'cus_test',{offset:'20'})).value.notifications.length,0);
    for(const secret of ['endpoint','click_token','p256dh','auth','audience']) assert.equal(Object.hasOwn(ownInbox.value.notifications[0],secret),false);
    const receipt = (await db.query('SELECT click_token FROM oweg_push_delivery')).rows[0].click_token;
    assert.equal((await call(clicks.POST,{token:'guess'})).code,400);
    assert.equal((await call(clicks.POST,{token:receipt})).code,204);
    const clickTime = (await db.query('SELECT clicked_at FROM oweg_push_delivery')).rows[0].clicked_at;
    await call(clicks.POST,{token:receipt});
    assert.equal(String((await db.query('SELECT clicked_at FROM oweg_push_delivery')).rows[0].clicked_at),String(clickTime));

    await call(customer.POST, subscription(2), 'cus_other');
    let result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_other' });
    assert.equal(result.code, 200);
    send = async () => { throw Object.assign(new Error('Do not log endpoint/keys'), { statusCode: 503 }) };
    await service.dispatchPushBatch();
    let delivery = (await db.query('SELECT * FROM oweg_push_delivery WHERE campaign_id=$1', [result.value.campaign.id])).rows[0];
    assert.equal(delivery.status, 'pending'); assert.equal(delivery.attempts, 1); assert.equal(delivery.error_code, 'HTTP_503');
    await db.query("UPDATE oweg_push_delivery SET next_attempt=now()-interval '1 second' WHERE id=$1", [delivery.id]);
    send = async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }) };
    await service.dispatchPushBatch();
    assert.equal((await db.query('SELECT active FROM oweg_push_subscription WHERE customer_id=$1', ['cus_other'])).rows[0].active, false);
    assert.equal((await db.query('SELECT status FROM oweg_push_delivery WHERE id=$1', [delivery.id])).rows[0].status, 'failed');
    // A missed provider notification is still visible in that recipient's inbox.
    assert.equal((await call(inbox.GET,null,'cus_other')).value.notifications.length,1);
    assert.equal((await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_other' })).code, 400);

    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    await call(admin.POST, { action: 'cancel', id: result.value.campaign.id, revision: 1 });
    const callsBefore = networkCalls;
    await service.dispatchPushBatch(); assert.equal(networkCalls, callsBefore);

    // Expired campaign and inactive subscription never send.
    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    await call(customer.DELETE, { endpoint: subscription(1).endpoint });
    await service.dispatchPushBatch(); assert.equal(networkCalls, callsBefore);
    await call(customer.POST, subscription(1));
    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    await db.query("UPDATE oweg_push_campaign SET expires_at=now()-interval '1 second' WHERE id=$1", [result.value.campaign.id]);
    await service.dispatchPushBatch(); assert.equal(networkCalls, callsBefore);
    const history = await call(admin.GET, null);
    assert.equal(JSON.stringify(history.value).includes('p256dh'), false);
    assert.equal(JSON.stringify(history.value).includes(receipt),false);
    assert.equal(history.value.campaigns.find(row=>row.id===c.id).clicked,1);
    // Recover a crashed lease and cap every tick at ten provider requests.
    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    send = async () => { throw Object.assign(new Error('Retry fixture'), { statusCode: 503 }) };
    await service.dispatchPushBatch();
    await db.query("UPDATE oweg_push_delivery SET status='sending',lease_until=now()-interval '1 second' WHERE campaign_id=$1", [result.value.campaign.id]);
    send = async () => undefined;
    await service.dispatchPushBatch();
    assert.equal((await db.query('SELECT status FROM oweg_push_delivery WHERE campaign_id=$1',[result.value.campaign.id])).rows[0].status,'accepted');
    const deduped = await call(inbox.GET,null);
    assert.equal(new Set(deduped.value.notifications.map(item=>item.id)).size,deduped.value.notifications.length);
    for(let n=10;n<25;n++) await call(customer.POST,subscription(n),'cus_test');
    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    const beforeBatch = networkCalls;
    await service.dispatchPushBatch(); assert.equal(networkCalls-beforeBatch,10);
    await service.dispatchPushBatch(); assert.equal(networkCalls-beforeBatch,16);
    await service.dispatchPushBatch(); assert.equal(networkCalls-beforeBatch,16);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM oweg_push_delivery WHERE campaign_id=$1',[result.value.campaign.id])).rows[0].count,16);
    assert.equal((await call(inbox.GET,null)).value.notifications.filter(item=>item.id===result.value.campaign.id).length,1);
    await db.query("UPDATE oweg_push_campaign SET expires_at=now()-interval '1 second' WHERE id=$1",[result.value.campaign.id]);
    assert.equal((await call(inbox.GET,null)).value.notifications.find(item=>item.id===result.value.campaign.id).expired,true);
    result = await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' });
    await db.query("UPDATE customer SET deleted_at=now() WHERE id='cus_test'");
    const beforeDeletion = networkCalls;
    await service.dispatchPushBatch();assert.equal(networkCalls,beforeDeletion);
    assert.equal((await call(customer.POST,subscription(30),'cus_test')).code,401);
    env.WEB_PUSH_ENABLED = 'false'; assert.equal((await service.dispatchPushBatch()).disabled, true);
    assert.equal((await call(admin.POST, { action: 'test', campaign: campaign(), test_customer: 'cus_test' })).code, 400);
    console.log('PASS isolated SQL/route/transport scenarios. Provider is mocked; multi-session contention and physical-device UAT remain rollout checks.');
  } finally { await db.close() }
});

test('marketing permissions are scoped on both page and API', () => {
  const policy = load('lib/admin-access/policy.ts');
  const access = load('shared/admin-access.ts');
  const role = permissions => ({ active: true, kind: 'subadmin', permissions });
  assert.equal(policy.canAccessAdminApi(role(['marketing.notifications']), 'POST', '/admin/push-notifications'), true);
  assert.equal(policy.canAccessAdminApi(role(['catalog']), 'POST', '/admin/push-notifications'), false);
  assert.equal(access.canAccessAdminPage(role(['marketing.notifications']), '/push-notifications'), true);
  assert.equal(access.canAccessAdminPage(role(['orders']), '/push-notifications'), false);
});

test('6000 opted-in browsers drain in bounded batches with no duplicate receipts', async () => {
  db = new PGlite(); env.WEB_PUSH_ENABLED = 'true';
  try {
    await db.exec(fs.readFileSync('my-medusa-store/migrations/web-push.sql','utf8').replace('SELECT pg_advisory_xact_lock(74638291);',''));
    await db.exec("CREATE TABLE customer(id text PRIMARY KEY,deleted_at timestamptz);INSERT INTO customer VALUES('cus_scale',NULL)");
    const ids=Array.from({length:6000},()=>randomUUID());
    await db.query(`INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth)
      SELECT unnest($1::uuid[]),'cus_scale',unnest($2::text[]),$3,$4`,[ids,ids.map(id=>'https://fcm.googleapis.com/fcm/send/'+id),keys.publicKey,subscription(1).keys.auth]);
    const result=await call(admin.POST,{action:'test',campaign:campaign(),test_customer:'cus_scale'});
    let active=0,peak=0,total=0,rounds=0;
    send=async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;total++};
    const started=Date.now();
    for(;rounds<650;rounds++){
      const before=total;await service.dispatchPushBatch();assert(total-before<=10);
      const state=(await db.query('SELECT status FROM oweg_push_campaign WHERE id=$1',[result.value.campaign.id])).rows[0];
      if(state.status==='completed')break;
    }
    assert.equal(total,6000);assert(peak<=2);assert(rounds<650);
    const counts=(await db.query('SELECT count(*)::int AS total,count(DISTINCT subscription_id)::int AS devices FROM oweg_push_delivery')).rows[0];
    assert.equal(counts.total,6000);assert.equal(counts.devices,6000);
    console.log(`PASS 6000 mocked recipients in ${rounds+1} batches; peak provider concurrency ${peak}; isolated-engine time ${Date.now()-started}ms. This is not a production throughput benchmark.`);
  }finally{await db.close()}
});

test('standalone worker never overlaps ticks, pauses between batches and reports stale/error health',async()=>{
  const {runLoop,healthy,BATCH_PAUSE_MS}=require('../my-medusa-store/scripts/web-push-worker.cjs');
  let ticks=0,active=0;const events=[];
  await runLoop({stopped:()=>ticks===3,sleep:async ms=>{assert.equal(active,0);assert.equal(ms,BATCH_PAUSE_MS);events.push('pause')},tick:async()=>{assert.equal(active,0);active++;events.push('tick');await new Promise(r=>setImmediate(r));active--;ticks++}});
  assert.deepEqual(events,['tick','pause','tick','pause','tick']);
  let sleeps=0;await runLoop({once:true,stopped:()=>false,tick:async()=>{},sleep:async()=>{sleeps++}});assert.equal(sleeps,0);
  assert.equal(healthy({last_success_at:new Date(200000)},210000),true);
  assert.equal(healthy({last_success_at:new Date(10000)},210000),false);
  assert.equal(healthy({last_success_at:new Date(200000),last_error_at:new Date(205000)},210000),false);
});

test('retention only removes expired terminal notification history and preserves commerce data',async()=>{
  db=new PGlite();try{
    await db.exec(fs.readFileSync('my-medusa-store/migrations/web-push.sql','utf8').replace('SELECT pg_advisory_xact_lock(74638291);',''));
    await db.exec("CREATE TABLE customer(id text PRIMARY KEY,deleted_at timestamptz);INSERT INTO customer VALUES('cus_keep',NULL);CREATE TABLE qa_wallet(amount int);INSERT INTO qa_wallet VALUES(1250)");
    const old=randomUUID(),draft=randomUUID(),recent=randomUUID(),queued=randomUUID();
    await db.query(`INSERT INTO oweg_push_campaign(id,title,body,url,status,expires_at,created_by,updated_at) VALUES
      ($1,'old','test','/','completed',now()-interval '100 days','qa',now()-interval '100 days'),
      ($2,'draft','test','/','draft',now()+interval '1 day','qa',now()-interval '100 days'),
      ($3,'recent','test','/','completed',now()-interval '1 day','qa',now()),
      ($4,'queued','test','/','sending',now()+interval '1 day','qa',now()-interval '100 days')`,[old,draft,recent,queued]);
    const ids=Array.from({length:1010},()=>randomUUID());
    await db.query(`INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth,active,updated_at)
      SELECT unnest($1::uuid[]),'cus_keep',unnest($2::text[]),$3,$4,false,now()-interval '100 days'`,[ids,ids.map(id=>'https://fcm.googleapis.com/fcm/send/'+id),keys.publicKey,subscription(1).keys.auth]);
    await db.query(`INSERT INTO oweg_push_delivery(id,campaign_id,subscription_id,click_token,status)
      SELECT unnest($1::uuid[]),$2,unnest($3::uuid[]),unnest($4::uuid[]),'accepted'`,[ids.map(()=>randomUUID()),old,ids,ids.map(()=>randomUUID())]);
    const first=await service.cleanupPushHistory(pool);assert.equal(first.deliveries,1000);assert.equal(first.campaigns,0);assert(first.subscriptions<=500);
    const second=await service.cleanupPushHistory(pool);assert.equal(second.deliveries,10);assert.equal(second.campaigns,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM oweg_push_campaign')).rows[0].n,3);
    assert.equal((await db.query('SELECT amount FROM qa_wallet')).rows[0].amount,1250);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM customer')).rows[0].n,1);
  }finally{await db.close()}
});


test('audience search includes unsubscribed customers, limits pilot eligibility and escapes search',async()=>{
 db=new PGlite();try{
  await db.exec(fs.readFileSync('my-medusa-store/migrations/web-push.sql','utf8').replace('SELECT pg_advisory_xact_lock(74638291);',''));
  await db.exec("CREATE TABLE customer(id text PRIMARY KEY,email text,first_name text,last_name text,created_at timestamptz DEFAULT now(),deleted_at timestamptz);INSERT INTO customer(id,email,first_name) VALUES('cus_one','one@example.test','One'),('cus_two','two@example.test','Two'),('cus_no','no@example.test','No');INSERT INTO customer(id,email,deleted_at) VALUES('cus_deleted','deleted@example.test',now())");
  for(const id of ['cus_one','cus_two','cus_deleted'])await db.query("INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth) VALUES($1,$2,$3,'key','key')",[randomUUID(),id,'https://fcm.googleapis.com/'+id]);
  const selector=load('api/admin/push-notifications/customers/route.ts');
  const result=await call(selector.GET,{}, 'admin', {limit:'1',offset:'0'});
  assert.equal(result.value.total,3);assert.equal(result.value.customers.length,1);assert(!('endpoint' in result.value.customers[0]));
  const next=await call(selector.GET,{}, 'admin', {limit:'1',offset:'1'});assert.notEqual(next.value.customers[0].id,result.value.customers[0].id);
  const search=await call(selector.GET,{}, 'admin', {q:'two@example.test'});assert.equal(search.value.customers[0].id,'cus_two');
  const unsubscribed=await call(selector.GET,{}, 'admin', {q:'no@example.test'});assert.equal(unsubscribed.value.customers[0].devices,0);
  const byName=await call(selector.GET,{}, 'admin', {q:'tWo'});assert.equal(byName.value.customers[0].id,'cus_two');
  const eligible=await call(selector.GET,{}, 'admin', {eligible:'true'});assert.equal(eligible.value.total,2);assert(eligible.value.customers.every(c=>c.devices>0));
  const deleted=await call(selector.GET,{}, 'admin', {q:'deleted@example.test'});assert.equal(deleted.value.total,0);
  const large=validation.campaignSchema.safeParse({...campaign(),audience:Array.from({length:6000},(_,i)=>'cus_'+i),audience_mode:'selected'});assert.equal(large.success,true);
  const wildcard=await call(selector.GET,{}, 'admin', {q:'%'});assert.equal(wildcard.value.total,0);
  assert.equal(validation.campaignSchema.safeParse({...campaign(),audience:[],audience_mode:'selected'}).success,false);
  assert.equal(validation.campaignSchema.safeParse({...campaign(),audience:['cus_one'],audience_mode:'selected'}).success,true);
 }finally{await db.close()}
});


test('notification image uploads use dated isolated S3 keys, verified formats and no ACL',async()=>{
 const images=load('lib/web-push/images.ts');
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(images.notificationImageKey('png',new Date('2026-11-03T13:30:00.123Z'),id),'notifications/2026/11/03/2026-11-03T13-30-00-123Z_'+id+'.png');
 assert.throws(()=>images.notificationImageKey('../bad',new Date(),id));
 assert.throws(()=>images.notificationImageType(Buffer.from('<svg>bad</svg>')));
 assert.throws(()=>images.notificationImageType(Buffer.alloc(2*1024*1024+1)));
 env.S3_BUCKET='qa-notification-bucket';env.S3_REGION='ap-south-1';
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
 const before=imageUploads.length;const result=await images.uploadNotificationImage(png);
 assert.equal(imageUploads.length,before+1);const object=imageUploads.at(-1);
 assert.match(object.Key,/^notifications\/\d{4}\/\d{2}\/\d{2}\//);assert.equal(object.ContentType,'image/png');assert.equal(object.ACL,undefined);assert.equal(object.Metadata.purpose,'notification-campaign');assert.equal(object.ServerSideEncryption,'AES256');assert(result.url.endsWith(object.Key));
 assert.equal(validation.safeImage(result.url),true);assert.equal(validation.safeImage('https://other-bucket.s3.ap-south-1.amazonaws.com/image.png'),false);
 uploadFails=true;await assert.rejects(()=>images.uploadNotificationImage(png));uploadFails=false;
 delete env.S3_BUCKET;delete env.S3_REGION;
});
