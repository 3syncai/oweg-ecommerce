import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../modules/returns"
import { returnPayoutView } from "../../../../lib/return-payout-view"
import { returnImageViews } from "../../../../lib/return-images"
import { Pool } from "pg"
import { quoteReturnSettlement } from "../../../../lib/return-financial-settlement"
import { transaction } from "../../../../lib/payment-reliability"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({ id })
  if (!requests.length) {
    throw new MedusaError(MedusaErrorTypes.NOT_FOUND, "Return request not found.")
  }
  const request = requests[0]
  const items = await returnService.listReturnRequestItems({ return_request_id: id })

  const payout = returnPayoutView(request)
  const { bank_details_encrypted: _encrypted, ...safeRequest } = request
  res.setHeader("Cache-Control", "no-store")
  let refundQuote:unknown=null
  let refundQuoteError:string|null=null
  if(['received','picked_up','refunded'].includes(request.status)) {
    const pool=new Pool({connectionString:process.env.DATABASE_URL})
    try {refundQuote=await transaction(pool,client=>quoteReturnSettlement(client,id))}
    catch(error){refundQuoteError=error instanceof Error?error.message:"refund_quote_unavailable"}
    finally{await pool.end()}
  }

  return res.json({
    return_request: {
      ...safeRequest,
      items,
      ...payout,
      refund_quote:refundQuote,
      refund_quote_error:refundQuoteError,
      images: await returnImageViews(request),
    },
  })
}
