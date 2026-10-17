/* Run under PM2/systemd alongside the storefront; no browser session needed. */
require('@next/env').loadEnvConfig(process.cwd());
const base=(process.env.PAYMENT_WORKER_APP_URL||process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000').replace(/\/$/,'');
if(!process.env.INTERNAL_API_SECRET)throw Error('INTERNAL_API_SECRET required');
let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
async function tick(){
 const response=await fetch(base+'/api/internal/payment-work',{method:'POST',headers:{'content-type':'application/json','x-internal-api-secret':process.env.INTERNAL_API_SECRET},body:JSON.stringify({process:!process.argv.includes('--status')}),signal:AbortSignal.timeout(110000)});
 if(!response.ok)throw Error('payment_worker_http_'+response.status);
 console.log(JSON.stringify({at:new Date().toISOString(),...await response.json()}));
}
(async()=>{do{try{await tick();}catch(error){console.error(error.message);if(process.argv.includes('--once')||process.argv.includes('--status'))process.exitCode=1;}
 if(stopped||process.argv.includes('--once')||process.argv.includes('--status'))break;
 await new Promise(resolve=>setTimeout(resolve,10000));}while(!stopped);})().catch(()=>{process.exitCode=1;});
