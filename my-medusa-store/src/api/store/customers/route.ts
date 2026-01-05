import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  MedusaErrorTypes,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"

import type { StoreCreateCustomerType } from "./validators"

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

  const body = req.validatedBody as StoreCreateCustomerType

  const customerData = {
    email: body.email,
    first_name: body.first_name,
    last_name: body.last_name,
    phone: body.phone,
    customer_type: body.customer_type,
    company_name:
      body.customer_type === "business" ? body.company_name ?? null : null,
    gst_number:
      body.customer_type === "business" ? body.gst_number ?? null : null,
    referral_code: body.referral_code ?? null,
    newsletter_subscribe: body.newsletter_subscribe ?? false,
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

  const customer = await refetchCustomer(
    result.id,
    req.scope,
    (req.queryConfig as typeof req.queryConfig | undefined)?.fields as string[] | undefined
  )

  res.status(200).json({ customer })
}

