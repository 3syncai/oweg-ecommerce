import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  MedusaErrorTypes,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"

import {
  assignCustomerToOwegGroup,
  inferOwegAccountType,
  isValidGstin,
  isValidPartnerReferralCode,
  resolveCustomerModule,
} from "../../../lib/customer-groups"
import { persistOwegCustomerFields } from "../../../lib/persist-oweg-customer-fields"

/** Stock Medusa StoreCreateCustomer shape (strict). OWEG fields live in metadata. */
type StockCreateCustomerBody = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  company_name?: string | null
  metadata?: Record<string, unknown> | null
}

function resolveAccountType(meta: Record<string, unknown>): "individual" | "business" {
  const raw =
    typeof meta.user_type === "string"
      ? meta.user_type
      : typeof meta.customer_type === "string"
        ? meta.customer_type
        : "individual"
  return String(raw).toLowerCase() === "business" ? "business" : "individual"
}

async function refetchCustomer(
  customerId: string,
  scope: MedusaRequest["scope"],
  fields?: string[]
) {
  const remoteQuery = scope.resolve(
    ContainerRegistrationKeys.REMOTE_QUERY
  )
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "customer",
    variables: {
      filters: { id: customerId },
    },
    fields: fields || [],
  })
  const customers = await remoteQuery(queryObject)
  return customers?.[0]
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: {
      actor_id?: string
      auth_identity_id?: string
    }
  }).auth_context

  if (authContext?.actor_id) {
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      "Request already authenticated as a customer."
    )
  }

  const body = req.validatedBody as StockCreateCustomerBody
  const meta = (body.metadata || {}) as Record<string, unknown>
  const customer_type = resolveAccountType(meta)
  const company_name =
    (typeof body.company_name === "string" && body.company_name.trim()) ||
    (typeof meta.company_name === "string" && meta.company_name.trim()) ||
    null
  const gst_number =
    (typeof meta.gst_number === "string" && meta.gst_number.trim()) || null
  const referral_code =
    (typeof meta.referral_code === "string" &&
      meta.referral_code.trim().toUpperCase()) ||
    null
  const newsletterRaw = meta.newsletter_subscribe ?? meta.newsletter_opt_in
  const newsletter_subscribe =
    newsletterRaw === true ||
    newsletterRaw === "true" ||
    newsletterRaw === 1

  if (customer_type === "business") {
    if (!company_name) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "Company name is required for business accounts"
      )
    }
    if (!gst_number || !isValidGstin(gst_number)) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "A valid 15-character GSTIN is required for business accounts"
      )
    }
  }

  const customerData = {
    email: body.email,
    first_name: body.first_name,
    last_name: body.last_name,
    phone: body.phone,
    customer_type,
    company_name: customer_type === "business" ? company_name : null,
    gst_number:
      customer_type === "business"
        ? String(gst_number).trim().toUpperCase()
        : null,
    referral_code,
    newsletter_subscribe,
    metadata: {
      ...meta,
      user_type: customer_type,
      customer_type,
      ...(referral_code ? { referral_code } : {}),
      ...(company_name ? { company_name } : {}),
      ...(gst_number
        ? { gst_number: String(gst_number).trim().toUpperCase() }
        : {}),
      wallet_coins:
        typeof meta.wallet_coins === "number" ? meta.wallet_coins : 0,
    },
  }

  const workflow = createCustomerAccountWorkflow(req.scope)

  const workflowInput = {
    customerData,
  } as any

  if (authContext?.auth_identity_id) {
    workflowInput.authIdentityId = authContext.auth_identity_id
  }

  const { result } = await workflow.run({
    input: workflowInput,
  })

  // Force-persist OWEG columns via SQL — core CreateCustomerDTO is strict.
  try {
    const customerModule = resolveCustomerModule(req.scope)
    if (customerModule.updateCustomers) {
      await customerModule.updateCustomers(result.id, {
        customer_type: customerData.customer_type,
        company_name: customerData.company_name,
        gst_number: customerData.gst_number,
        referral_code: customerData.referral_code,
        newsletter_subscribe: customerData.newsletter_subscribe,
        metadata: customerData.metadata,
      })
    }
  } catch (err) {
    console.warn("[store/customers] Failed to sync OWEG via module:", err)
  }

  const sqlPersist = await persistOwegCustomerFields({
    customerId: result.id,
    customer_type: customerData.customer_type,
    company_name: customerData.company_name,
    gst_number: customerData.gst_number,
    referral_code: customerData.referral_code,
    newsletter_subscribe: customerData.newsletter_subscribe,
    metadata: customerData.metadata,
  })
  if (!sqlPersist.ok) {
    console.warn(
      "[store/customers] Failed to SQL-persist OWEG fields:",
      sqlPersist.error
    )
  }

  try {
    const hasPartnerReferral = await isValidPartnerReferralCode(referral_code)
    const accountType = inferOwegAccountType({
      customer_type: customerData.customer_type,
      metadata: customerData.metadata,
      gst_number: customerData.gst_number,
    })
    const customerModule = resolveCustomerModule(req.scope)
    await assignCustomerToOwegGroup(customerModule, {
      customerId: result.id,
      accountType,
      hasPartnerReferral,
    })
  } catch (err) {
    console.warn(
      "[store/customers] Failed to assign OWEG customer group:",
      err
    )
  }

  const customer = await refetchCustomer(
    result.id,
    req.scope,
    (req.queryConfig as typeof req.queryConfig | undefined)?.fields as
      | string[]
      | undefined
  )

  res.status(200).json({ customer })
}
