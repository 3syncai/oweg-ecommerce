import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../modules/returns"
import { decryptBankDetails } from "../../../../services/return-bank-crypto"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({ id })
  if (!requests.length) {
    throw new MedusaError(MedusaErrorTypes.NOT_FOUND, "Return request not found.")
  }
  const request = requests[0]
  const items = await returnService.listReturnRequestItems({ return_request_id: id })

  let bank_details: Record<string, string> | null = null
  if (request.bank_details_encrypted) {
    bank_details = decryptBankDetails(request.bank_details_encrypted)
  }

  return res.json({
    return_request: {
      ...request,
      items,
      bank_details,
    },
  })
}
