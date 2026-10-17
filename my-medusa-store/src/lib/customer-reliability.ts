/**
 * A transparent, behaviour-based customer rating. This is not a product
 * review: it helps sellers and admins understand a customer's completed
 * purchase history without judging customers who are still new.
 *
 * A rating only appears after the customer has one resolved order. Returns
 * count as one incident and replacements as half an incident, so a legitimate
 * replacement is less severe than a completed return.
 */
export type CustomerReliability = {
  rating: number | null
  label: "New customer" | "Excellent" | "Good" | "Watch" | "High return rate"
  eligible_orders: number
  returns_count: number
  replacements_count: number
}

export type CustomerReliabilityOrder = {
  id: string
  customer_id?: string | null
  email?: string | null
  delivered?: boolean
}

export type CustomerReliabilityRequest = {
  order_id: string
  type?: string | null
  status?: string | null
}

export const customerReliabilityKey = (input: { customer_id?: string | null; email?: string | null }) =>
  input.customer_id || String(input.email || "").trim().toLowerCase() || "guest"

/** Only completed return outcomes affect the score; rejected/open requests do not. */
function isCompletedOutcome(request: CustomerReliabilityRequest) {
  const status = String(request.status || "").toLowerCase()
  if (String(request.type || "").toLowerCase() === "replacement") {
    return status === "replaced" || status === "closed"
  }
  return status === "received" || status === "refunded" || status === "closed"
}

export function buildCustomerReliability(
  orders: CustomerReliabilityOrder[],
  requests: CustomerReliabilityRequest[]
): Map<string, CustomerReliability> {
  const requestsByOrder = new Map<string, CustomerReliabilityRequest[]>()
  for (const request of requests) {
    if (!isCompletedOutcome(request)) continue
    const current = requestsByOrder.get(request.order_id) || []
    current.push(request)
    requestsByOrder.set(request.order_id, current)
  }

  const totals = new Map<string, { eligible: number; returns: number; replacements: number }>()
  for (const order of orders) {
    const key = customerReliabilityKey(order)
    const outcomes = requestsByOrder.get(order.id) || []
    const hasOutcome = outcomes.length > 0
    // Pending/cancelled-only histories remain unrated (new customer).
    if (!order.delivered && !hasOutcome) continue
    const value = totals.get(key) || { eligible: 0, returns: 0, replacements: 0 }
    value.eligible += 1
    if (outcomes.some((item) => String(item.type || "").toLowerCase() === "return")) value.returns += 1
    if (outcomes.some((item) => String(item.type || "").toLowerCase() === "replacement")) value.replacements += 1
    totals.set(key, value)
  }

  const result = new Map<string, CustomerReliability>()
  for (const [key, value] of totals) {
    if (value.eligible === 0) continue
    const incidentRate = (value.returns + value.replacements * 0.5) / value.eligible
    const rating = Math.round(Math.max(1, Math.min(5, 5 - incidentRate * 4)) * 10) / 10
    result.set(key, {
      rating,
      label: rating >= 4.5 ? "Excellent" : rating >= 3.5 ? "Good" : rating >= 2.5 ? "Watch" : "High return rate",
      eligible_orders: value.eligible,
      returns_count: value.returns,
      replacements_count: value.replacements,
    })
  }
  return result
}

export const newCustomerReliability = (): CustomerReliability => ({
  rating: null,
  label: "New customer",
  eligible_orders: 0,
  returns_count: 0,
  replacements_count: 0,
})
