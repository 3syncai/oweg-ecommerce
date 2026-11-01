import type { VendorProfile, VendorProfileUpdate, VendorLogin, UploadResponse, UploadedFile, VendorProduct,
  ProductInput, ProductDetailResponse, ProductVariantMatrix, VariantMatrixInput, Metadata, VendorOrder, OrderTracking,
  VendorPayout, ProductCategory, ProductCollection, ProductType, ProductTag, VendorStats, VendorInventoryRow,
  VendorCustomer, ReportProductSnapshot, ReportOrderSnapshot } from "./contracts"
import type { ShippingEstimate } from "../shipping-estimate"
/**
 * API Client for Medusa Backend
 * Handles all API requests to the vendor endpoints
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios'

// Use same-origin proxy by default to avoid browser CORS issues.
// Can be overridden with NEXT_PUBLIC_USE_DIRECT_MEDUSA=true for debugging.
const USE_DIRECT_MEDUSA = process.env.NEXT_PUBLIC_USE_DIRECT_MEDUSA === "true"

const API_URL = USE_DIRECT_MEDUSA
  ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000')
  : '/api/medusa'

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''

// Debug logging (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('API Client initialized with URL:', API_URL)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Narrow arbitrary thrown values and backend error envelopes without discarding raw details. */
function readMessage(value: unknown, fallback: string): string {
  const message = isRecord(value) ? value.message : undefined
  return typeof message === "string" && message ? message : fallback
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return isRecord(value) && typeof value.url === "string" && Boolean(value.url)
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Log API failures without passing Error objects (avoids Next.js console overlays). */
export function logApiFailure(context: string, error: unknown) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error)
  console.warn(`${context}: ${message}`)
}

export async function apiRequest<T>(
  endpoint: string,
  options: AxiosRequestConfig<unknown> = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add publishable key if available
  if (PUBLISHABLE_KEY) {
    defaultHeaders['x-publishable-api-key'] = PUBLISHABLE_KEY
  }

  // Add authorization header if token exists
  const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await axios<T>({
      url,
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      data: options.data,
      params: options.params,
      ...options,
    })

    return response.data
  } catch (error: unknown) {
    // Handle network errors (CORS, connection refused, etc.)
    if (error instanceof AxiosError) {
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        console.warn(
          `Network error: unable to reach backend at ${API_URL} (${endpoint})`
        )
        throw new ApiError(
          0,
          `Network error: Unable to reach backend at ${API_URL}. Please check if the backend is running and CORS is configured correctly.`,
          { originalError: error.message, url }
        )
      }

      const errorData: unknown = error.response?.data || { message: error.message }
      let message =
        (isRecord(errorData) && readMessage(errorData, "")) ||
        (typeof errorData === "string" ? errorData : null) ||
        "API request failed"

      // Medusa Express 404 HTML: <pre>Cannot GET /vendor/returns</pre>
      if (typeof message === "string" && message.includes("<")) {
        const plain = message.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        if (plain) message = plain
      }

      throw new ApiError(
        error.response?.status || 0,
        message,
        errorData
      )
    }
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error
    }
    // Wrap other errors
    throw new ApiError(0, readMessage(error, 'Unknown error occurred'), error)
  }
}

// Vendor Auth API
export const vendorAuthApi = {
  login: async (email: string, password: string) => {
    // Don't use apiRequest for login since we don't have a token yet
    const url = `${API_URL}/vendor/auth/login`
    try {
      const response = await axios.post<VendorLogin>(url, { email, password }, {
        headers: {
          'Content-Type': 'application/json',
          ...(PUBLISHABLE_KEY ? { 'x-publishable-api-key': PUBLISHABLE_KEY } : {}),
        },
      })
      return response.data
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, 'Login failed'),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, 'Login failed'), error)
    }
  },

  logout: async () => {
    return apiRequest('/vendor/auth/logout', {
      method: 'POST',
    })
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiRequest<{ ok: true }>('/vendor/auth/change-password', {
      method: 'POST',
      data: { old_password: currentPassword, new_password: newPassword },
    })
  },
}

// Keep profile images on the existing registration upload endpoint.
async function uploadStoreImage(file: File, vendorHint: string, type: 'logo' | 'banner') {
  const formData = new FormData()
  formData.append('type', type)
  formData.append('vendorHint', vendorHint)
  formData.append('file', file, file.name)
  const headers: Record<string, string> = {}
  if (PUBLISHABLE_KEY) headers['x-publishable-api-key'] = PUBLISHABLE_KEY
  const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const { data } = await axios.post<UploadResponse>(`${API_URL}/store/vendor/uploads`, formData, { headers })
    const uploaded = data.files?.find((entry: { type?: string }) => entry.type === type) || data.files?.[0] || data
    if (!isUploadedFile(uploaded)) throw new Error('Upload returned no image URL')
    return uploaded
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const details: unknown = error.response?.data || { message: error.message }
      throw new ApiError(error.response?.status || 0, readMessage(details, 'Upload failed'), details)
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Upload failed', error)
  }
}

// Vendor Profile API
export const vendorProfileApi = {
  getMe: async () => {
    return apiRequest<{ vendor: VendorProfile }>('/store/vendors/me')
  },

  updateProfile: async (data: VendorProfileUpdate) => {
    return apiRequest<{ vendor: VendorProfile }>('/vendor/profile', {
      method: 'PUT',
      data,
    })
  },

  uploadLogo: (file: File, vendorHint: string) => uploadStoreImage(file, vendorHint, 'logo'),
  uploadBanner: (file: File, vendorHint: string) => uploadStoreImage(file, vendorHint, 'banner'),

  reapply: async (data: {
    name?: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    telephone?: string | null
    store_name?: string | null
    store_phone?: string | null
    store_address?: string | null
    store_country?: string | null
    store_region?: string | null
    store_city?: string | null
    store_pincode?: string | null
    store_logo?: string | null
    store_banner?: string | null
    shipping_policy?: string | null
    return_policy?: string | null
    whatsapp_number?: string | null
    pan_gst?: string | null
    gst_no?: string | null
    pan_no?: string | null
    bank_name?: string | null
    account_no?: string | null
    ifsc_code?: string | null
    cancel_cheque_url?: string | null
    documents?: Array<{ key: string; url: string; name?: string; type?: string; category?: string }> | null
  }) => {
    return apiRequest<{ message: string; vendor: VendorProfile }>('/store/vendors/reapply', {
      method: 'POST',
      data,
    })
  },
}

// Vendor Signup API
export const vendorSignupApi = {
  signup: async (data: {
    // Personal Information
    name: string
    firstName?: string
    lastName?: string
    email: string
    phone?: string
    telephone?: string

    // Store Information
    store_name?: string
    store_phone?: string
    store_address?: string
    store_country?: string
    store_region?: string
    store_city?: string
    store_pincode?: string
    store_logo?: string
    store_banner?: string
    shipping_policy?: string
    return_policy?: string
    whatsapp_number?: string

    // Tax & Legal Information
    pan_gst?: string
    gst_no?: string
    pan_no?: string

    // Banking Information
    bank_name?: string
    account_no?: string
    ifsc_code?: string
    cancel_cheque_url?: string

    // Documents
    documents?: Array<{ key: string; url: string; name?: string; type?: string; category?: string }>

    // Password
    password?: string
  }) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (PUBLISHABLE_KEY) {
      headers['x-publishable-api-key'] = PUBLISHABLE_KEY
    }

    try {
      const response = await axios.post<{ vendor: VendorProfile }>(`${API_URL}/store/vendors/signup`, data, { headers })
      return response.data
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, 'Signup failed'),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, 'Signup failed'), error)
    }
  },

  uploadFile: async (
    file: File,
    type: 'logo' | 'banner' | 'cancelcheque' | 'doc' | 'pancard' | 'report',
    vendorHint: string
  ) => {
    const formData = new FormData()
    formData.append('type', type)
    formData.append('vendorHint', vendorHint)
    formData.append('file', file, file.name)

    const headers: Record<string, string> = {}
    if (PUBLISHABLE_KEY) {
      headers['x-publishable-api-key'] = PUBLISHABLE_KEY
    }

    try {
      const response = await axios.post<UploadResponse>(`${API_URL}/store/vendor/uploads`, formData, {
        headers,
      })
      return response.data
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, 'Upload failed'),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, 'Upload failed'), error)
    }
  },

  validate: async (field: string, value: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (PUBLISHABLE_KEY) {
      headers['x-publishable-api-key'] = PUBLISHABLE_KEY
    }

    try {
      const response = await axios.post<{ exists: boolean; message: string }>(`${API_URL}/vendors/validate`, { field, value }, { headers })
      return response.data
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, 'Validation failed'),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, 'Validation failed'), error)
    }
  },
}

export type GstTaxCode = {
  code: string
  label: string
  rate: number
  description: string
}

export const vendorGstApi = {
  listTaxCodes: async (params?: { q?: string; suggest?: string; category?: string }) => {
    const query = new URLSearchParams()
    if (params?.q) query.set("q", params.q)
    if (params?.suggest) query.set("suggest", params.suggest)
    if (params?.category) query.set("category", params.category)
    const qs = query.toString()
    return apiRequest<{
      tax_codes: GstTaxCode[]
      count: number
      suggested: GstTaxCode | null
      source: string
      note?: string
    }>(`/vendor/gst/tax-codes${qs ? `?${qs}` : ""}`)
  },
}

export const vendorBrandsApi = {
  checkAuthorization: async (brandName: string) => {
    return apiRequest<{
      requires_authorization: boolean
      status: "authorized" | "pending" | "missing" | string
      authorization?: {
        brand_name?: string
        uploaded_at?: string
        verified?: boolean
        file_url?: string
      }
    }>("/vendor/brands/check-authorization", {
      params: { brand_name: brandName },
    })
  },
}

// Vendor Products API
export const vendorProductsApi = {
  list: async (params?: { limit?: number; offset?: number; q?: string; status?: string; all?: boolean }, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    if (params?.all) qs.set('all', '1')
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    if (params?.q) qs.set('q', params.q)
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs}` : ''
    return apiRequest<{
      products: VendorProduct[]
      count?: number
      limit?: number
      offset?: number
      counts?: { total: number; published: number; draft: number; pending: number }
    }>(`/vendor/products${suffix}`, { signal })
  },

  get: async (id: string) => {
    return apiRequest<ProductDetailResponse>(`/vendor/products/${id}`)
  },

  create: async (data: ProductInput) => {
    return apiRequest<{ product: VendorProduct }>('/vendor/products', {
      method: 'POST',
      data,
    })
  },

  migrateFromUrl: async (url: string) => {
    return apiRequest<{
      draft: {
        title: string
        handle: string
        description: string
        brand: string
        hasVariants: boolean
        productOptions: Array<{ title: string; values: string[]; valuesInput?: string }>
        variants: Array<{
          title: string
          sku: string
          managedInventory: boolean
          allowBackorder: boolean
          inventoryCount: string
          price: string
          discountedPrice: string
          optionValues: Record<string, string>
        }>
        uploadedImages: Array<{
          url: string
          key: string
          filename: string
          originalName: string
        }>
        colorImages?: Record<
          string,
          Array<{
            url: string
            key: string
            filename: string
            originalName: string
          }>
        >
        thumbnailUrl: string | null
        sku?: string
        price?: string
        discounted_price?: string
        metadata: {
          source_url: string
          source: string
          brand?: string
        }
      }
      warnings: string[]
    }>('/vendor/products/migrate-from-url', {
      method: 'POST',
      data: { url },
    })
  },

  update: async (id: string, data: ProductInput) => {
    return apiRequest<{ product: VendorProduct; variant_ids?: string[]; atomic_edit_version?: number }>(`/vendor/products/${id}`, {
      method: 'PUT',
      data,
    })
  },

  setStatus: async (id: string, action: 'draft' | 'publish') => {
    return apiRequest<{ product: VendorProduct; message?: string }>(`/vendor/products/${id}/status`, {
      method: 'POST',
      data: { action },
    })
  },

  updateVariants: async (id: string, data: VariantMatrixInput) => {
    return apiRequest<{ product_id: string; variant_matrix: ProductVariantMatrix | null; metadata: Metadata }>(
      `/vendor/products/${id}/variants`,
      {
        method: 'PATCH',
        data,
      }
    )
  },

  delete: async (id: string) => {
    return apiRequest(`/vendor/products/${id}`, {
      method: 'DELETE',
    })
  },

  importImageUrl: async (url: string, signal?: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await apiRequest<{ url: string; key: string; stored: boolean }>("/vendor/products/import-image-url", {
          method: "POST", data: { url }, signal, timeout: 46000,
        })
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429 || attempt >= 2 || signal?.aborted) throw error
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)))
      }
    }
  },

  uploadImage: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await axios.post<UploadResponse>(`${API_URL}/vendor/products/upload-image`, formData, {
        headers,
      })
      return response.data
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, 'Upload failed'),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, 'Upload failed'), error)
    }
  },
}

// Vendor Orders API
let listOrdersInFlight: Promise<{
  orders: VendorOrder[]
  counts?: Record<string, number>
  count?: number
  limit?: number
  offset?: number
}> | null = null
let countsInFlight: Promise<{
  orders: VendorOrder[]
  counts?: Record<string, number>
  count?: number
}> | null = null

export type VendorOrdersListParams = {
  limit?: number
  offset?: number
  stage?: string
  q?: string
  all?: boolean
  counts_only?: boolean
}

function ordersQuery(params?: VendorOrdersListParams) {
  const qs = new URLSearchParams()
  if (params?.all) qs.set('all', '1')
  if (params?.counts_only) qs.set('counts_only', '1')
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  if (params?.stage) qs.set('stage', params.stage)
  if (params?.q) qs.set('q', params.q)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const vendorOrdersApi = {
  /** Order list — pass limit/offset for server pagination; omit for full list (dashboard). */
  list: async (params?: VendorOrdersListParams) => {
    const key = ordersQuery(params)
    // Only dedupe identical in-flight unscoped full lists
    if (!params && listOrdersInFlight) return listOrdersInFlight
    const req = apiRequest<{
      orders: VendorOrder[]
      counts?: Record<string, number>
      count?: number
      limit?: number
      offset?: number
    }>(`/vendor/orders${key}`)
    if (!params) {
      listOrdersInFlight = req.finally(() => {
        listOrdersInFlight = null
      })
      return listOrdersInFlight
    }
    return req
  },

  /** Stage counts only (badge polling) — avoids shipping full order payloads. */
  counts: async () => {
    if (countsInFlight) return countsInFlight
    countsInFlight = apiRequest<{
      orders: VendorOrder[]
      counts?: Record<string, number>
      count?: number
    }>('/vendor/orders?counts_only=1').finally(() => {
      countsInFlight = null
    })
    return countsInFlight
  },

  get: async (id: string) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}`)
  },

  accept: async (id: string) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/accept`, {
      method: 'POST',
    })
  },

  chooseEasyShipping: async (
    id: string,
    data: {
      courier_id?: number
      courier_partner_name?: string
      rate?: number
      freight_charge?: number
      weight?: number
      length?: number
      breadth?: number
      height?: number
      tracking_number?: string
      tracking_url?: string
      label_url?: string
    }
  ) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/shipping`, {
      method: 'POST',
      data: { method: 'easy', ...data },
    })
  },

  listCouriers: async (
    id: string,
    params?: {
      weight?: number
      length?: number
      breadth?: number
      height?: number
    }
  ) => {
    const query = new URLSearchParams()
    if (params?.weight != null) query.set('weight', String(params.weight))
    if (params?.length != null) query.set('length', String(params.length))
    if (params?.breadth != null) query.set('breadth', String(params.breadth))
    if (params?.height != null) query.set('height', String(params.height))
    const qs = query.toString()
    return apiRequest<{
      couriers: Array<{
        courier_id: number
        courier_name: string
        rate: number | null
        etd: string | null
        freight_charge: number | null
        rto_charges: number | null
        cod_charges: number | null
        charge_weight: number | null
        cod: boolean
        is_surface: boolean
        rating: number | null
      }>
      provider?: string
      provider_label?: string
      pickup_postcode: string
      pickup_city?: string
      pickup_address?: string
      delivery_postcode: string
      weight: number
      length: number
      breadth: number
      height: number
      volumetric_weight?: number
      applied_weight?: number
      package_source?: 'product' | 'default' | 'manual'
      suggested_package?: {
        weight: number
        length: number
        breadth: number
        height: number
        source: 'product' | 'default'
        notes?: string
      }
      count: number
    }>(`/vendor/orders/${id}/couriers${qs ? `?${qs}` : ''}`)
  },

  estimateShippingRate: async (params: {
    declared_value?: number
    refresh?: boolean
    weight?: number
    length?: number
    width?: number
    breadth?: number
    height?: number
    pickup_pincode?: string
    delivery_pincode?: string
  }, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (params.weight != null && !isNaN(params.weight)) query.set('weight', String(params.weight))
    if (params.length != null && !isNaN(params.length)) query.set('length', String(params.length))
    if (params.width != null && !isNaN(params.width)) query.set('width', String(params.width))
    if (params.breadth != null && !isNaN(params.breadth)) query.set('breadth', String(params.breadth))
    if (params.height != null && !isNaN(params.height)) query.set('height', String(params.height))
    if (params.pickup_pincode) query.set('pickup_pincode', params.pickup_pincode)
    if (params.delivery_pincode) query.set('delivery_pincode', params.delivery_pincode)
    if (params.declared_value != null) query.set('declared_value', String(params.declared_value))
    if (params.refresh) query.set('refresh', 'true')
    const qs = query.toString()
    return apiRequest<ShippingEstimate>(`/vendor/shipping/estimate-rate${qs ? `?${qs}` : ''}`, { signal, timeout: 90000 })
  },

  chooseSelfShipping: async (
    id: string,
    data: {
      courier_partner_name: string
      tracking_source?: 'shiprocket' | 'carrier_api' | 'manual'
      awb: string
      packing_info: string
      tracking_url?: string
      dispatch_rate?: number
      label_url?: string
    }
  ) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/shipping`, {
      method: 'POST',
      data: { method: 'self', ...data },
    })
  },

  generateInvoice: async (id: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
    const response = await axios<Blob>({
      url: `${API_URL}/vendor/orders/${id}/invoice`,
      method: 'POST',
      responseType: 'blob',
      headers: {
        ...(PUBLISHABLE_KEY ? { 'x-publishable-api-key': PUBLISHABLE_KEY } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    return response.data
  },

  markReadyToDispatch: async (id: string) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/rtd`, {
      method: 'POST',
    })
  },
  markDispatched: async (id: string) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/dispatch`, {
      method: 'POST',
    })
  },

  /** Self-ship only: vendor confirms delivery while In Transit */
  markDelivered: async (id: string, data?: { delivery_confirmation?: string }) => {
    return apiRequest<{ order: VendorOrder }>(`/vendor/orders/${id}/delivered`, {
      method: 'POST',
      data: data || {},
    })
  },

  track: async (id: string) => {
    return apiRequest<{ order: VendorOrder; tracking: OrderTracking }>(`/vendor/orders/${id}/track`)
  },
}

export const vendorShippingApi = {
  estimateRate: vendorOrdersApi.estimateShippingRate,
}

export type VendorEarningsSummary = {
  available_balance: number
  unlocking_balance: number
  total_credited: number
  total_withdrawn: number
  unlocking: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    net_amount: number
    gross_amount: number
    commission_rate?: number
    commission_amount?: number
    unlock_at: string
    delivered_at: string | null
  }>
  credited_recent: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    net_amount: number
    gross_amount?: number
    commission_rate?: number
    commission_amount?: number
    credited_at: string | null
  }>
  reversed_recent: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    net_amount: number
    reversed_at: string | null
  }>
  reversed_total: number
}

export type VendorPaymentsView = {
  cards: {
    full_sale: number
    taxes?: number
    lifetime_commission?: number
    lifetime_tcs?: number
    lifetime_tds?: number
    total_sale: number
    gst: number
    commission: number
    tcs: number
    tds: number
    logistic_fee: number
    return_fee?: number
    platform_fee?: number
    partner_commission?: number
    settlement_balance: number
    balance: number
    pending_payment: number
    unlocking_payment?: number
    withdrawn: number
  }
  settlements: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    product_name: string
    type: "sales" | "return" | "claim" | "payment" | "cancellation"
    category?: "sale" | "return" | "payment" | "claim" | "cancellation"
    invoice_no?: string
    item_status?: string
    order_amount: number
    taxable_amount: number
    gst_amount: number
    gst_rate?: number
    listing_gst?: number
    listing_total?: number
    platform_rate?: number
    platform_fee?: number
    platform_gst?: number
    platform_total?: number
    commission_rate?: number
    commission: number
    commission_gst?: number
    commission_total?: number
    partner_rate?: number
    partner_commission?: number
    partner_gst?: number
    partner_total?: number
    tcs_rate?: number
    tcs: number
    tds_rate?: number
    tds: number
    logistic_fee: number
    customer_shipping_fee?: number
    customer_shipping_gst?: number
    customer_shipping_total?: number
    logistic_gst?: number
    logistic_total?: number
    return_fee?: number
    reverse_logistic_gst?: number
    reverse_logistic_total?: number
    cancellation_fee?: number
    cancellation_gst?: number
    cancellation_total?: number
    payment_gateway_rate?: number
    payment_gateway_fee?: number
    payment_gateway_gst?: number
    payment_gateway_total?: number
    claim_amount?: number
    cashback_amount?: number
    taxes: number
    settlement_amount: number
    bank_settlement?: number
    payment?: number
    balance_amount?: number
    transaction_id?: string | null
    payment_date?: string | null
    status?: "UNLOCKING" | "CREDITED" | "PAID" | "REVERSED" | "ON_HOLD" | "PAYMENT"
    delivered_at?: string | null
    unlock_at?: string | null
  }>
  timezone: string
  unlock_minutes?: number
  as_of: string
}

export type VendorOrderEarning = {
  id: string
  order_id: string
  order_display_id: string | null
  net_amount: number
  gross_amount: number
  status: 'UNLOCKING' | 'CREDITED' | 'PAID' | 'REVERSED' | 'ON_HOLD'
  unlock_at: string | null
  credited_at: string | null
}

// Vendor Payouts API
async function payoutRequestWithFallback<T>(
  primary: { path: string; method?: string },
  fallback: { path: string; method?: string }
): Promise<T> {
  try {
    return await apiRequest<T>(primary.path, { method: primary.method || 'GET' })
  } catch (error: unknown) {
    // Hosted Medusa may not have /summary or /earnings-by-orders yet — use routes that exist.
    if (isRecord(error) && error.status === 404) {
      return await apiRequest<T>(fallback.path, { method: fallback.method || 'GET' })
    }
    throw error
  }
}

export const vendorPayoutsApi = {
  summary: async () => {
    return payoutRequestWithFallback<{ summary: VendorEarningsSummary; unlock_minutes: number }>(
      { path: '/vendor/payouts/summary' },
      { path: '/vendor/payouts' }
    )
  },

  sync: async () => {
    return payoutRequestWithFallback<{
      promoted: number
      summary: VendorEarningsSummary
      unlock_minutes: number
    }>(
      { path: '/vendor/payouts/summary', method: 'POST' },
      { path: '/vendor/payouts', method: 'POST' }
    )
  },

  earningsByOrders: async (orderIds: string[]) => {
    if (orderIds.length === 0) return { earnings: {} as Record<string, VendorOrderEarning> }
    const query = new URLSearchParams({ order_ids: orderIds.join(',') })
    return payoutRequestWithFallback<{ earnings: Record<string, VendorOrderEarning> }>(
      { path: `/vendor/payouts/earnings-by-orders?${query.toString()}` },
      { path: `/vendor/payouts?${query.toString()}` }
    )
  },

  list: async () => {
    return apiRequest<{ summary?: VendorEarningsSummary; payouts: VendorPayout[]; totals: { total_credited: number; total_commission: number; total_gross: number }; count: number }>('/vendor/payouts')
  },

  payments: async () => {
    // Settlement changes are time-sensitive (delivery/unlock transitions). Do
    // not let a browser reuse an earlier ledger response after a delivery.
    return apiRequest<VendorPaymentsView>("/vendor/payouts/payments", {
      params: { _ts: Date.now() },
    })
  },
}

export type VendorCommissionInvoice = {
  invoice_title: string
  invoice_number: string
  invoice_date: string
  period_label: string
  period_from: string | null
  period_to: string | null
  period_key?: string | null
  auto_generated?: boolean
  billed_from: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
    pan: string
  }
  billed_to: {
    display_name: string
    business_name: string
    address: string
    place_of_supply: string
    phone: string
    email: string
    gstin: string | null
    pan: string | null
  }
  orders: Array<{
    order_id: string
    order_display_id: string | number | null
    product_name: string
    delivered_at: string | null
    category?: "sale" | "return" | "cancellation"
    status?: string
    sale_amount: number
    taxable_amount?: number
    product_gst_rate?: number
    product_gst?: number
    listing_total?: number
    logistic_fee: number
    logistic_gst?: number
    platform_fee?: number
    platform_gst?: number
    commission_rate: number
    commission_amount: number
    commission_gst?: number
    partner_commission?: number
    partner_gst?: number
    tcs?: number
    tds?: number
    return_fee?: number
    reverse_logistic_gst?: number
    cancellation_fee?: number
    invoice_date: string | null
  }>
  service_lines: Array<{
    sac: string
    description: string
    net_taxable: number
    gst_rate: number
    gst_amount: number
    total: number
  }>
  fee_summary?: {
    sale_amount: number
    product_gst: number
    logistic_fee: number
    platform_fee: number
    platform_gst: number
    commission: number
    commission_gst: number
    partner: number
    partner_gst: number
    tcs: number
    tds: number
    reverse_logistic: number
    cancellation_fee: number
  }
  totals: {
    net_taxable: number
    gst_amount: number
    grand_total: number
  }
}

export const vendorCommissionInvoicesApi = {
  get: async (params?: {
    range?: "today" | "1m" | "3m" | "6m" | "1y" | "last_month" | "month" | "custom" | "all"
    from?: string
    to?: string
    month?: number | string
    year?: number | string
  }) => {
    const qs = new URLSearchParams()
    if (params?.range) qs.set("range", params.range)
    if (params?.from) qs.set("from", params.from)
    if (params?.to) qs.set("to", params.to)
    if (params?.month != null) qs.set("month", String(params.month))
    if (params?.year != null) qs.set("year", String(params.year))
    const suffix = qs.toString() ? `?${qs}` : ""
    return apiRequest<VendorCommissionInvoice>(`/vendor/commission-invoices${suffix}`)
  },
}

// Vendor Categories API
export const vendorCategoriesApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.offset) query.append('offset', params.offset.toString())

    const queryString = query.toString()
    return apiRequest<{ product_categories: ProductCategory[]; count: number }>(
      `/vendor/categories${queryString ? `?${queryString}` : ''}`
    )
  },
}

// Vendor Collections API
export const vendorCollectionsApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.offset) query.append('offset', params.offset.toString())

    const queryString = query.toString()
    return apiRequest<{ collections: ProductCollection[]; count: number }>(
      `/vendor/collections${queryString ? `?${queryString}` : ''}`
    )
  },
}

// Vendor Product Types API — used by the bulk-upload combobox.
// Vendors can also send a brand-new value when creating a product;
// the products POST endpoint will auto-create the type.
export const vendorTypesApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.offset) query.append('offset', params.offset.toString())

    const queryString = query.toString()
    return apiRequest<{ product_types: ProductType[]; count: number }>(
      `/vendor/types${queryString ? `?${queryString}` : ''}`
    )
  },
}

// Vendor Product Tags API — used by the bulk-upload tag chip editor.
// New tag values typed by the vendor are auto-created server-side.
export const vendorTagsApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.offset) query.append('offset', params.offset.toString())

    const queryString = query.toString()
    return apiRequest<{ product_tags: ProductTag[]; count: number }>(
      `/vendor/tags${queryString ? `?${queryString}` : ''}`
    )
  },
}

// Vendor Stats API
export const vendorStatsApi = {
  get: async () => {
    return apiRequest<{ stats: VendorStats }>('/vendor/stats')
  },
}

// Vendor Inventory API
export const vendorInventoryApi = {
  list: async (params?: { limit?: number; offset?: number; q?: string; all?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.all) qs.set('all', '1')
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    if (params?.q) qs.set('q', params.q)
    const suffix = qs.toString() ? `?${qs}` : ''
    return apiRequest<{
      success: boolean
      inventory: VendorInventoryRow[]
      total?: number
      count?: number
      limit?: number
      offset?: number
    }>(`/vendor/inventory${suffix}`)
  },

  update: async (variantId: string, quantity: number) => {
    return apiRequest<{ success: boolean; message: string }>('/vendor/inventory/update', {
      method: 'POST',
      data: {
        variant_id: variantId,
        quantity,
      },
    })
  },
}

// Vendor Customers API
export const vendorCustomersApi = {
  list: async () => {
    return apiRequest<{ customers: VendorCustomer[] }>('/vendor/customers')
  },
}

export type VendorReturnCourier = {
  courier_id: number
  courier_name: string
  rate: number | null
  etd: string | number | null
  freight_charge?: number | null
  rating?: number | null
}

export type VendorReturnRequest = {
  images?: Array<{ key: string; order_item_id: string; url: string }>
  id: string
  order_id: string
  order_display_id: string | number | null
  type: 'return' | 'replacement' | string
  status: string
  reason: string | null
  notes: string | null
  payment_type: string | null
  refund_method: string | null
  rejection_reason: string | null
  approved_at: string | null
  rejected_at: string | null
  pickup_initiated_at: string | null
  picked_up_at: string | null
  received_at: string | null
  refunded_at: string | null
  shiprocket_awb: string | null
  shiprocket_status: string | null
  created_at: string
  updated_at?: string
  customer_email: string | null
  customer_name: string | null
  items: Array<{
    id: string
    order_item_id: string
    quantity: number
    title?: string
    condition?: string | null
    reason?: string | null
  }>
  vendor_items: Array<{
    id: string
    title: string
    quantity: number
  }>
  order_total: number | null
  shipping_method?: 'easy' | 'self' | string | null
  reverse_courier_id?: number | null
  reverse_courier_name?: string | null
  reverse_courier_rate?: number | null
  reverse_courier_selected_at?: string | null
  reverse_tracking_number?: string | null
  reverse_tracking_url?: string | null
  reverse_label_url?: string | null
  reverse_courier_partner?: string | null
  reverse_tracking_saved_at?: string | null
  can_select_reverse_courier?: boolean
  can_add_self_tracking?: boolean
  needs_return_logistics?: boolean
  can_mark_pickup_initiated?: boolean
  can_mark_picked_up?: boolean
  can_mark_received?: boolean
  returned_to_vendor?: boolean
  returned_to_vendor_at?: string | null
  easy_return_booking_status?: 'awaiting_admin' | 'booked' | null
  easy_return_status_label?: string | null
  awaiting_admin_return_booking?: boolean
  return_logistics_timeline?: Array<{
    key: string
    label: string
    at: string | null
    done: boolean
    active?: boolean
  }>
}

// Vendor Returns API
export const vendorReturnsApi = {
  list: async (params?: {
    limit?: number
    offset?: number
    status?: string
    q?: string
    all?: boolean
    counts_only?: boolean
  }) => {
    const qs = new URLSearchParams()
    if (params?.all) qs.set('all', '1')
    if (params?.counts_only) qs.set('counts_only', '1')
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    if (params?.status) qs.set('status', params.status)
    if (params?.q) qs.set('q', params.q)
    const suffix = qs.toString() ? `?${qs}` : ''
    return apiRequest<{
      return_requests: VendorReturnRequest[]
      count?: number
      limit?: number
      offset?: number
      counts?: {
        total: number
        pending_approval: number
        in_progress: number
        pickup?: number
        refunded?: number
        needs_logistics?: number
      }
    }>(`/vendor/returns${suffix}`)
  },
  listCouriers: async (returnId: string) => {
    return apiRequest<{
      couriers: VendorReturnCourier[]
      pickup_postcode: string
      delivery_postcode: string
      delivery_city?: string
      count: number
    }>(`/vendor/returns/${returnId}/couriers`)
  },
  selectCourier: async (
    returnId: string,
    body: {
      courier_id: number
      courier_name: string
      rate?: number
      freight_charge?: number
    }
  ) => {
    return apiRequest<{
      return_request: Partial<VendorReturnRequest> & { id: string; order_id: string; type: string; status: string }
      selected: { courier_id: number; courier_name: string }
    }>(`/vendor/returns/${returnId}/select-courier`, {
      method: 'POST',
      data: body,
    })
  },
  saveSelfTracking: async (
    returnId: string,
    body: {
      tracking_number?: string
      tracking_url?: string
      label_url?: string
      courier_partner?: string
    }
  ) => {
    return apiRequest<{
      return_request: Partial<VendorReturnRequest> & { id: string; order_id: string; type: string; status: string }
      self_tracking: {
        tracking_number: string | null
        tracking_url: string | null
        label_url: string | null
        courier_partner: string | null
      }
    }>(`/vendor/returns/${returnId}/self-tracking`, {
      method: 'POST',
      data: body,
    })
  },
  updateStatus: async (
    returnId: string,
    action: 'pickup_initiated' | 'picked_up' | 'received'
  ) => {
    return apiRequest<{ return_request: Partial<VendorReturnRequest> & { id: string; order_id: string; type: string; status: string }; action: string; message: string }>(
      `/vendor/returns/${returnId}/status`,
      {
        method: 'POST',
        data: { action },
      }
    )
  },
}

/** Lightweight badge / notification snapshot */
export const vendorPulseApi = {
  get: async () => {
    return apiRequest<{
      to_accept: number
      returns_pending_approval: number
      returns_in_progress: number
      open_tickets: number
      payout: {
        available_balance: number
        unlocking_balance: number
        total_withdrawn: number
      }
      credited_recent: Array<{
        id: string
        order_id: string
        order_display_id?: string | null
        net_amount: number
        credited_at?: string | null
      }>
      revision?: string
      ms?: number
    }>('/vendor/pulse')
  },
}

export type VendorReportTicket = {
  id: string
  vendor_id: string
  order_id: string
  order_display_id?: string | null
  return_request_id?: string | null
  source: "return" | "order_lookup" | string
  issue_title: string
  issue_description: string
  product_snapshot?: ReportProductSnapshot | null
  order_snapshot?: ReportOrderSnapshot | null
  image_urls?: string[] | null
  status: "open" | "in_review" | "resolved" | "closed" | string
  admin_notes?: string | null
  approved_amount?: number | null
  product_name?: string | null
  order_total?: number | null
  currency_code?: string | null
  created_at?: string
  updated_at?: string
}

// Vendor Claims (lost / wrong return, order issues — Flipkart-style claims)
export const vendorReportsApi = {
  list: async () => {
    return apiRequest<{ reports: VendorReportTicket[] }>("/vendor/reports")
  },

  create: async (data: {
    order_id: string
    return_request_id?: string | null
    source?: "return" | "order_lookup"
    issue_title: string
    issue_description: string
    image_urls?: string[]
  }) => {
    return apiRequest<{ report: VendorReportTicket }>("/vendor/reports", {
      method: "POST",
      data,
    })
  },

  uploadImage: async (file: File, vendorHint: string) => {
    const formData = new FormData()
    formData.append("type", "report")
    formData.append("vendorHint", vendorHint)
    formData.append("file", file, file.name)

    const headers: Record<string, string> = {}
    if (PUBLISHABLE_KEY) {
      headers["x-publishable-api-key"] = PUBLISHABLE_KEY
    }
    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    try {
      const response = await axios.post<UploadResponse>(`${API_URL}/store/vendor/uploads`, formData, {
        headers,
      })
      const data = response.data
      const url = data?.files?.[0]?.url || data?.url
      if (!url) {
        throw new ApiError(500, "Upload succeeded but no file URL was returned", data)
      }
      return { url, key: data?.files?.[0]?.key }
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error
      if (error instanceof AxiosError) {
        const errorData: unknown = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          readMessage(errorData, "Upload failed"),
          errorData
        )
      }
      throw new ApiError(0, readMessage(error, "Upload failed"), error)
    }
  },
}
