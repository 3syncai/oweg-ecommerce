import type { ShippingEstimate } from "@/lib/shipping-estimate"

export default function ShippingEstimateDetails({ estimate }: { estimate: Partial<ShippingEstimate> }) {
  if (estimate.coverage_complete !== false) return null
  return <p role="status" className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
    Shipping needs verification before submission. Refresh logistics or contact support.
  </p>
}
