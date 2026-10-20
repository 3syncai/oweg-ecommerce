/** Wire contracts for the custom Medusa vendor routes. Metadata stays unknown until narrowed. */
export type Metadata = Record<string, unknown>
export type VendorDocument = { key: string; url: string; name?: string; type?: string; category?: string }

// modules/vendor/models/vendor.ts; dates are serialized JSON strings.
export type VendorProfile = {
  id: string; name: string; email: string; created_at: string; updated_at: string
  first_name: string | null; last_name: string | null; phone: string | null; telephone: string | null
  store_name: string | null; store_phone: string | null; store_address: string | null
  store_country: string | null; store_region: string | null; store_city: string | null
  store_pincode: string | null; store_logo: string | null; store_banner: string | null
  shipping_policy: string | null; return_policy: string | null; whatsapp_number: string | null
  pan_gst: string | null; gst_no: string | null; pan_no: string | null
  bank_name: string | null; account_no: string | null; ifsc_code: string | null; cancel_cheque_url: string | null
  commission_rate: number; commission_override: boolean; platform_fee_rate: number; platform_fee_override: boolean
  cancellation_charge: number; cancellation_charge_override: boolean
  documents: VendorDocument[] | null; is_approved: boolean; approved_at: string | null; approved_by: string | null
  rejection_reason: string | null; rejected_at: string | null; rejected_by: string | null
  marketplace_seller_id: string | null; metadata: Metadata | null
}
export type VendorProfileUpdate = Partial<Pick<VendorProfile,
  "name" | "first_name" | "last_name" | "phone" | "telephone" | "whatsapp_number" |
  "store_name" | "store_phone" | "store_address" | "store_country" | "store_region" |
  "store_city" | "store_pincode" | "store_logo" | "store_banner" | "shipping_policy" | "return_policy">>
export type VendorLogin = {
  token: string
  vendor_user: { id: string; email: string; vendor_id: string | null; must_reset_password: boolean }
  vendor: Pick<VendorProfile, "id" | "name" | "email" | "is_approved" | "rejected_at" | "rejection_reason"> | null
}

export type UploadedFile = { url: string; key?: string; type?: string; name?: string; filename?: string; originalName?: string }
/** Direct-file legacy uploads and current {files} uploads are both consumed by the portal. */
export type UploadResponse = { files?: Array<UploadedFile & { key: string }>; url?: string; key?: string; message?: string }
export type ProductCategory = { id: string; name: string; handle: string; is_active: boolean; is_internal: boolean; parent_category_id: string | null; rank?: number; created_at?: string; updated_at?: string }
export type ProductCollection = { id: string; title: string; handle: string; metadata?: Metadata | null; created_at: string; updated_at: string; products?: VendorProduct[] }
export type ProductType = { id: string; value: string }
export type ProductTag = { id: string; value: string }
export type ProductPrice = { id?: string; amount: number; currency_code: string; price_list_id?: string | null }
export type ProductOption = { id?: string; title: string; values: Array<string | { id?: string; value: string; option_id?: string }> }
export type ProductVariant = {
  id: string; title: string | null; sku: string | null; manage_inventory?: boolean; allow_backorder?: boolean
  inventory_quantity?: number | null; prices?: ProductPrice[]; metadata?: Metadata | null
  options?: Array<{ value: string; option_id?: string; option?: { title: string } }>
}
export type ProductMetadata = Metadata & { approval_status?: string; vendor_id?: string; tax_code?: string | null; gst_rate?: number | string | null }
export type VendorProduct = {
  id: string; title: string; status: string; created_at: string; updated_at: string
  subtitle?: string | null; description?: string | null; handle?: string | null; thumbnail?: string | null
  images?: Array<{ id?: string; url: string }>; metadata?: ProductMetadata | null; variants?: ProductVariant[]
  options?: ProductOption[]; categories?: Array<{ id: string; name?: string }>; tags?: ProductTag[]
  collection_id?: string | null; collection?: ProductCollection | null; type_id?: string | null
  weight?: number | null; length?: number | null; width?: number | null; height?: number | null
}
export type ProductVariantInput = {
  id?: string; title?: string; sku?: string | null; manage_inventory?: boolean; allow_backorder?: boolean
  inventory_quantity?: number; prices?: ProductPrice[]; metadata?: Metadata
  options?: Record<string, string>; option_values?: Record<string, string>; price?: number; discounted_price?: number
}
// products POST/PUT support the same product fields, plus these custom offer fields.
export type ProductInput = {
  title?: string; subtitle?: string | null; description?: string | null; handle?: string | null; status?: string
  is_giftcard?: boolean; discountable?: boolean; category_ids?: string[]; collection_id?: string | null
  type?: string; type_id?: string | null; tags?: Array<string | { value: string }>; images?: Array<{ url: string }>
  thumbnail?: string | null; options?: Array<{ title: string; values: string[] }>; variants?: ProductVariantInput[]
  shipping_profile_id?: string | null; height?: number | null; width?: number | null; length?: number | null; weight?: number | null
  metadata?: Metadata; price?: number | null; discounted_price?: number | null; vendor_edit_remark?: string
  share_id?: string; share_token?: string
}
export type ProductVariantMatrix = {
  options: Array<{ title: string; values: string[] }>
  variants: Array<{ id: string; title: string | null; sku: string | null; manage_inventory: boolean; allow_backorder: boolean;
    inventory_quantity: number | null; price: number | null; discounted_price: number | null; option_values: Record<string, string> }>
}
export type VariantMatrixInput = {
  options?: Array<{ title: string; values: string[] }>; variants?: ProductVariantInput[]
  color_images?: Record<string, string[]>; primary_visual_option?: string; images?: Array<{ url: string }>; vendor_edit_remark?: string
}
export type ProductDetailResponse = {
  product: VendorProduct
  variant_summary?: { id: string; title: string | null; sku: string | null; price: number | null; discounted_price: number | null; discounted_price_list_id: string | null; currency_code: string } | null
  variant_matrix?: ProductVariantMatrix | null; color_images?: Record<string, string[]>; primary_visual_option?: string | null
}
export type VendorAddress = {
  id?: string; first_name?: string | null; last_name?: string | null; company?: string | null
  address_1?: string | null; address_2?: string | null; city?: string | null; province?: string | null
  postal_code?: string | null; country_code?: string | null; phone?: string | null
}
export type CustomerReliability = { rating: number | null; label: string; eligible_orders: number; returns_count: number; replacements_count: number }
export type VendorInventoryRow = {
  product_id: string; product_title: string; product_thumbnail: string | null; variant_id: string; variant_title: string
  variant_sku: string | null; inventory_item_id: string | null; inventory_level_id: string | null
  stock_quantity: number; location_id?: string; location_name: string; manage_inventory: boolean
}
export type VendorCustomer = {
  id: string; email: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null
  orders_count: number; open_orders_count: number; total_spent: number; order_value: number
  first_order_date: string; last_order_date: string; details_hidden: boolean; customer_reliability: CustomerReliability
}
export type VendorPayout = {
  id: string; amount: string | number | null; commission_amount: string | number | null; net_amount: string | number | null
  commission_rate: string | number | null; currency_code: string | null; transaction_id: string | null
  payment_method: string | null; status: string; notes: string | null; order_ids: string[] | null; created_at: string; updated_at: string
}
export type VendorStats = {
  total_products: number; total_orders: number; total_revenue: number; products_by_status: { draft: number; published: number }
  recent_orders: Array<{ id: string; display_id: string | number; email?: string | null; total?: number | { amount: number }; status?: string; created_at?: string }>
}
export type OrderTracking = {
  provider: string; status: string; status_label?: string; courier_partner_name?: string | null; awb?: string | null
  ndr_reason?: string | null; source?: string; error?: string | null
  checkpoints?: Array<{ date: string | null; status: string | null; location: string | null; activity: string | null }>
}
export type ReportProductSnapshot = Array<{ id: string; title?: string; quantity?: number; unit_price?: number; variant_sku?: string | null; product_id?: string | null }>
export type ReportOrderSnapshot = {
  id?: string; display_id?: string | number; email?: string | null; created_at?: string; currency_code?: string
  status?: string; total?: number; vendor_total?: number; shipping_address?: VendorAddress; customer_id?: string | null
}

export type VendorStage = "to_accept" | "to_pack" | "to_dispatch" | "in_transit" | "delivered" | "cancelled"

export type VendorWorkflow = {
  stage?: VendorStage
  accepted_at?: string
  shipping_method?: "easy" | "self"
  shipping_provider?: "itl" | "shiprocket" | string | null
  shiprocket_order_id?: string | number | null
  shiprocket_shipment_id?: string | number | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  cod_cash_collected_at?: string | null
  ndr_reason?: string | null
  ndr_at?: string | null
  rto_status?: string | null
  rto_at?: string | null
  easy_courier_id?: number | null
  easy_courier_partner?: string | null
  easy_courier_rate?: number | null
  easy_booking_status?: "intent" | "awaiting_admin" | "booked" | null
  admin_booked_at?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  label_url?: string | null
  self_courier_partner?: string | null
  self_tracking_source?: "shiprocket" | "carrier_api" | "manual" | null
  self_awb?: string | null
  self_dispatch_rate?: number | null
  self_packing_info?: string | null
  self_delivery_confirmation?: string | null
  self_delivered_at?: string | null
  return_courier_rate?: number | null
  invoice_generated_at?: string
  rtd_at?: string
}


export type VendorOrder = {
  id: string
  display_id?: string | number
  email?: string | null
  status?: string
  fulfillment_status?: string
  vendor_stage: VendorStage
  acceptance_deadline_at?: string | null
  acceptance_timed_out_at?: string | null
  order_update_notice?: { at?: string; previous_variant_title?: string | null; new_variant_title?: string | null;
    previous_unit_price?: number | null; unit_price?: number | null } | null
  vendor_status_label: string
  payment_type?: "Prepaid" | "PostPaid" | string
  total: number
  currency_code?: string
  created_at: string
  product_names?: string[]
  items?: Array<{ id: string; title: string; variant_title?: string; quantity: number; unit_price?: number }>
  shipping_address?: VendorAddress | null
  billing_address?: VendorAddress | null
  vendor_workflow?: VendorWorkflow
  taxable_amount?: number | null
  gst_amount?: number | null
  tcs_amount?: number | null
  tds_amount?: number | null
  commission_amount?: number | null
  settlement?: {
    taxable_amount: number
    gst_amount: number
    tcs_amount: number
    tds_amount: number
    commission_amount: number
    net_amount: number
    platform_fee?: number
    platform_gst?: number
    partner_commission?: number
    partner_gst?: number
    commission_gst?: number
    logistic_fee?: number
    logistic_gst?: number
    customer_shipping_fee?: number
    customer_shipping_gst?: number
    customer_shipping_total?: number
    return_fee?: number
    return_logistic_gst?: number
    listing_total?: number
    gst_rate?: number
    tcs_rate?: number
    tds_rate?: number
  } | null
  customer_details_hidden?: boolean
  cancelled?: boolean
  cancelled_by?: "admin" | "customer" | null
  cancellation_note?: string | null
  cancellation_at?: string | null
  cancellation_label?: string | null
  vendor_assignment_cancelled?: boolean
  assignment_cancellations?: Array<{ item_id: string; title: string; reason: string; at: string }>
  customer_reliability?: {
    rating: number | null
    label: string
    eligible_orders: number
    returns_count: number
    replacements_count: number
  }
}
