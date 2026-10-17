import { decryptBankDetails } from "../services/return-bank-crypto"

/** Called only by Returns-authorized admin endpoints; never by vendor/customer APIs. */
export function returnPayoutView(request: { bank_details_encrypted?: string | null }) {
  if (!request.bank_details_encrypted) return { bank_details: null, refund_details_error: null }
  try { return { bank_details: decryptBankDetails(request.bank_details_encrypted) as Record<string, string>, refund_details_error: null } }
  catch {
    return { bank_details: null, refund_details_error: "Refund details are unavailable. Check the backend encryption configuration before processing a refund." }
  }
}
