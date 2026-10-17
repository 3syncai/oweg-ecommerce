import {defineRouteConfig} from "@medusajs/admin-sdk"
import {Container,Heading,Text,Button,Badge} from "@medusajs/ui"
import {useEffect,useState} from "react"

type Job={id:string;kind:string;aggregate_id:string;state:string;attempts:number;last_error:string|null;updated_at:string}
type Health={worker:{last_finished_at:string|null;last_error:string|null}|null;capture_issues:Array<{order_id:string;last_error:string}>;summary:Array<{state:string;count:number}>;jobs:Job[];holds:Array<{id:string;order_id:string;amount_minor:number;created_at:string}>;receipts:Array<{return_id:string;actor_id:string;cash_minor:number;coin_minor:number;created_at:string}>}
const money=(minor:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(minor/100)
export default function PaymentHealth(){
 const [health,setHealth]=useState<Health|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{try{const response=await fetch('/admin/payment-health',{credentials:'include'});if(!response.ok)throw Error('Payment health is unavailable ('+response.status+')');setHealth(await response.json());setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to load payment health')}}
 useEffect(()=>{void load();const interval=setInterval(()=>{if(!document.hidden)void load()},10000);return()=>clearInterval(interval)},[])
 const retry=async(job:Job)=>{setBusy(true);try{const response=await fetch('/admin/payment-health',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({job_id:job.id})});if(!response.ok)throw Error('Could not retry this task');await load()}catch(e){setError(e instanceof Error?e.message:'Retry failed')}finally{setBusy(false)}}
 return <Container className="space-y-6 p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><Heading>Payment Health</Heading><Text>Superadmin · Refreshes every 10 seconds</Text></div><Button variant="secondary" onClick={()=>void load()}>Refresh</Button></div>
   {error&&<Text role="alert" className="text-ui-fg-error">{error}</Text>}
   {health&&<Text className={!health.worker?.last_finished_at||Date.now()-new Date(health.worker.last_finished_at).getTime()>180000||health.worker.last_error?'text-ui-fg-error':''}>Worker: {health.worker?.last_error||(!health.worker?.last_finished_at?'No successful run recorded':Date.now()-new Date(health.worker.last_finished_at).getTime()>180000?'Last successful run is over 3 minutes old':'Running')} {health.worker?.last_finished_at&&`· Last completed ${new Date(health.worker.last_finished_at).toLocaleString()}`}</Text>}
   {health?.capture_issues.map(issue=><Text key={issue.order_id} className="text-ui-fg-error">Capture reconciliation: {issue.order_id} · {issue.last_error}</Text>)}
   <div className="flex flex-wrap gap-3">{health?.summary.map(row=><Badge key={row.state} color={row.state==='dead'?'red':row.state==='done'?'green':'grey'}>{row.state}: {row.count}</Badge>)}</div>
   <section><Heading level="h2">Pending and failed processing</Heading><Text>Retries resume recorded work. They do not charge customers or send a bank payout.</Text>
     <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Task / order','State','Attempts','Issue','Action'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>
       {health?.jobs.map(job=><tr key={job.id} className="border-t border-ui-border-base"><td className="p-2"><div>{job.kind}</div><Text size="small">{job.aggregate_id}</Text></td><td className="p-2">{job.state}</td><td className="p-2">{job.attempts}</td><td className="p-2">{job.last_error||'—'}</td><td className="p-2">{job.state==='dead'&&<Button size="small" disabled={busy} onClick={()=>void retry(job)}>Retry task</Button>}</td></tr>)}
     </tbody></table></div>{health&&!health.jobs.length&&<Text className="py-3">No pending or failed tasks.</Text>}
   </section>
   <section><Heading level="h2">Reserved checkout coins</Heading>{health?.holds.map(hold=><div key={hold.id} className="flex flex-wrap justify-between gap-2 border-b p-2 text-sm"><span>{hold.order_id}</span><span>{money(Number(hold.amount_minor))}</span><span>{new Date(hold.created_at).toLocaleString()}</span></div>)}{health&&!health.holds.length&&<Text>No active reservations.</Text>}</section>
   <section><Heading level="h2">Recent manual refund receipts</Heading>{health?.receipts.map(receipt=><div key={receipt.return_id} className="border-b p-2 text-sm"><div>{receipt.return_id}</div><div>Cash {money(Number(receipt.cash_minor))} · Coins {money(Number(receipt.coin_minor))}</div><Text size="small">Recorded by {receipt.actor_id} · {new Date(receipt.created_at).toLocaleString()}</Text></div>)}</section>
 </Container>
}
export const config=defineRouteConfig({label:'Payment Health'})
