import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"

type ChangePasswordPayload = {
  current_password?: string
  new_password?: string
  currentPassword?: string
  newPassword?: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context

  if (!authContext?.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Customer authentication required.")
  }

  const body = (req.body ?? {}) as ChangePasswordPayload
  const currentPassword = (body.current_password ?? body.currentPassword ?? "").trim()
  const newPassword = (body.new_password ?? body.newPassword ?? "").trim()

  if (!currentPassword || !newPassword) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Current and new password are required.")
  }
  if (newPassword.length < 8) {
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      "New password must be at least 8 characters long."
    )
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const authService = req.scope.resolve(Modules.AUTH)

  const customer = await customerService.retrieveCustomer(authContext.actor_id)
  if (!customer?.email) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Customer email is missing.")
  }

  const authData = {
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: { email: customer.email, password: currentPassword },
    protocol: req.protocol,
  }

  const { success, error, authIdentity } = await authService.authenticate("emailpass", authData)
  if (!success || !authIdentity) {
    throw new MedusaError(
      MedusaErrorTypes.UNAUTHORIZED,
      error || "Current password is incorrect."
    )
  }

  const appMetadata = authIdentity.app_metadata || {}
  const linkedCustomerId = (appMetadata as Record<string, unknown>)?.customer_id

  if (linkedCustomerId && linkedCustomerId !== authContext.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Identity is linked to another customer.")
  }

  if (!linkedCustomerId) {
    await authService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: {
        ...appMetadata,
        customer_id: authContext.actor_id,
      },
    })
  }

  const updateResult = await authService.updateProvider("emailpass", {
    entity_id: customer.email,
    password: newPassword,
  })

  if (!updateResult?.success) {
    throw new MedusaError(
      MedusaErrorTypes.UNAUTHORIZED,
      updateResult?.error || "Unable to update password."
    )
  }

  if (!customer.has_account) {
    await customerService.updateCustomers(customer.id, { has_account: true })
  }

  return res.status(200).json({ success: true })
}
