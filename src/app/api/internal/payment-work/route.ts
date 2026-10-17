import {NextRequest,NextResponse} from "next/server";
import {requireInternalWalletMutationAuth} from "@/lib/wallet-mutation-auth";
import {runPaymentWorkBatch,reconcileUnrecordedCaptures} from "@/lib/payment-work-runner";
import {getPool} from "@/lib/wallet-ledger";
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
 const auth=await requireInternalWalletMutationAuth(req);if(auth.errorResponse)return auth.errorResponse;
 const body=await req.json().catch(()=>({}));
 if(body.process===true) {
   await getPool().query("INSERT INTO payment_worker_status(id,last_started_at) VALUES('checkout',now()) ON CONFLICT(id) DO UPDATE SET last_started_at=now()");
   try {
     const reconciliation=await reconcileUnrecordedCaptures();
     const work=await runPaymentWorkBatch();
     await getPool().query("UPDATE payment_worker_status SET last_finished_at=now(),last_error=NULL WHERE id='checkout'");
     return NextResponse.json({reconciliation,work});
   } catch {
     await getPool().query("UPDATE payment_worker_status SET last_error='worker_cycle_failed' WHERE id='checkout'").catch(()=>undefined);
     return NextResponse.json({error:'worker_cycle_failed'},{status:503});
   }
 }
 const state=await getPool().query("SELECT state,count(*)::int AS count,min(created_at) AS oldest FROM payment_work GROUP BY state");
 return NextResponse.json({queue:state.rows});
}
