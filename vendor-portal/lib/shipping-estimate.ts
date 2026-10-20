export type ShippingRouteEstimate = {
  pincode: string
  label: string
  status: "quoted" | "unavailable" | "error"
  quote?: { courier_name: string; freight_charge: number; carrier_freight: number; other_carrier_charges: number; gst_amount: number; total_logistics_fee: number; carrier_weight_slab: number | null; etd: string | number | null }
}

export type ShippingEstimate = {
  success: boolean
  provider: string
  courier_name: string
  freight_charge: number
  carrier_freight: number
  other_carrier_charges: number
  gst_rate: number
  gst_amount: number
  total_logistics_fee: number
  pickup_pincode: string
  delivery_pincode: string
  destination_label: string
  length: number
  width: number
  height: number
  weight: number
  volumetric_weight: number
  applied_weight: number
  volumetric_divisor: number
  coverage: "destination" | "national_benchmark"
  quoted_at: string
  expires_at: string
  routes: ShippingRouteEstimate[]
  coverage_complete: boolean
  warning: string
}
