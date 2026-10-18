import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import { getSharedDbPool } from "./db-pool"
import { getReplacementRequest } from "./vendor-replacement-requests"
import { withVendorOrderAssignmentLock } from "./vendor-order-assignment-lock"
import { sendVendorReplacementConsentCodeEmail } from "./vendor-replacement-mailer"

const CODE_LIFETIME_MINUTES = 10
const RESEND_INTERVAL_SECONDS = 60
const MAX_ATTEMPTS = 5

function signingKey() {
  const key = process.env.VENDOR_REPLACEMENT_CONSENT_SECRET
  if (!key || key.length < 32) throw new Error("Customer consent verification needs VENDOR_REPLACEMENT_CONSENT_SECRET")
  return key
}

export function hashReplacementConsentCode(requestId: string, variantId: string, code: string, key: string) {
  return createHmac("sha256", key).update(`${requestId}:${variantId}:${code}`).digest("hex")
}

export async function sendReplacementConsentCode(orderId: string, requestId: string, variantId: string) {
  return withVendorOrderAssignmentLock(orderId, async () => {
    const request = await getReplacementRequest(orderId, requestId)
    if (!request || request.status !== "pending") throw new Error("Only pending replacement choices can be verified")
    const choice = request.options.find((option) => option.variant_id === variantId)
    if (!choice) throw new Error("Select an offered replacement first")
    if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now())
      throw new Error("This replacement offer has expired")
    if (request.consent_code_sent_at && Date.now() - new Date(request.consent_code_sent_at).getTime() < RESEND_INTERVAL_SECONDS * 1000)
      throw new Error("Wait one minute before sending another code")
    const code = randomInt(0, 100_000_000).toString().padStart(8, "0")
    const digest = hashReplacementConsentCode(requestId, variantId, code, signingKey())
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
      consent_code_hash=$2,consent_variant_id=$3,consent_code_sent_at=now(),
      consent_code_expires_at=now()+interval '10 minutes',consent_code_attempts=0,
      consent_code_verified_at=NULL,updated_at=now()
      WHERE id=$1 AND status='pending'`, [requestId, digest, variantId])
    try {
      await sendVendorReplacementConsentCodeEmail({
        to: request.customer_email, orderId, code,
        variant: Object.entries(choice.options || {}).map(([name, value]) => `${name}: ${value}`).join(", ") || choice.variant_title,
        storeName: choice.store_name, unitPrice: choice.unit_price,
        expiresInMinutes: CODE_LIFETIME_MINUTES,
      })
    } catch (error) {
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
        consent_code_hash=NULL,consent_code_sent_at=NULL,consent_code_expires_at=NULL,updated_at=now()
        WHERE id=$1 AND consent_code_hash=$2`, [requestId, digest])
      throw error
    }
    return { sent: true, expires_in_minutes: CODE_LIFETIME_MINUTES }
  })
}

/** Called under the order assignment lock immediately before recording acceptance. */
export async function verifyReplacementConsentCode(requestId: string, variantId: string, code: string) {
  if (!/^\d{8}$/.test(code)) throw new Error("Enter the eight digit code the customer received")
  const result = await getSharedDbPool().query<{
    consent_code_hash: string | null; consent_variant_id: string | null
    consent_code_expires_at: string | null; consent_code_attempts: number
  }>(`SELECT consent_code_hash,consent_variant_id,consent_code_expires_at,consent_code_attempts
    FROM vendor_replacement_request WHERE id=$1`, [requestId])
  const record = result.rows[0]
  if (!record?.consent_code_hash || record.consent_variant_id !== variantId
    || !record.consent_code_expires_at || new Date(record.consent_code_expires_at).getTime() <= Date.now())
    throw new Error("Send a new code for this replacement choice")
  if (Number(record.consent_code_attempts) >= MAX_ATTEMPTS)
    throw new Error("Too many code attempts. Send a new code")
  const expected = Buffer.from(record.consent_code_hash, "hex")
  const supplied = Buffer.from(hashReplacementConsentCode(requestId, variantId, code, signingKey()), "hex")
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
      consent_code_attempts=consent_code_attempts+1,updated_at=now() WHERE id=$1`, [requestId])
    throw new Error("The customer code is incorrect")
  }
}
