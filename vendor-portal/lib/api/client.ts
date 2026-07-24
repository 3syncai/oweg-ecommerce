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

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: any
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
  options: AxiosRequestConfig = {}
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
    const response = await axios({
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
  } catch (error: any) {
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

      const errorData = error.response?.data || { message: error.message }
      let message =
        (typeof errorData === "object" && errorData?.message) ||
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
    throw new ApiError(0, error?.message || 'Unknown error occurred', error)
  }
}

// Vendor Auth API
export const vendorAuthApi = {
  login: async (email: string, password: string) => {
    // Don't use apiRequest for login since we don't have a token yet
    const url = `${API_URL}/vendor/auth/login`
    try {
      const response = await axios.post(url, { email, password }, {
        headers: {
          'Content-Type': 'application/json',
          ...(PUBLISHABLE_KEY ? { 'x-publishable-api-key': PUBLISHABLE_KEY } : {}),
        },
      })
      return response.data
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Login failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Login failed', error)
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

// Vendor Profile API
export const vendorProfileApi = {
  getMe: async () => {
    return apiRequest<{ vendor: any }>('/store/vendors/me')
  },

  updateProfile: async (data: any) => {
    return apiRequest<{ vendor: any }>('/vendor/profile', {
      method: 'PUT',
      data,
    })
  },

  uploadLogo: async (file: File, vendorHint: string) => {
    const formData = new FormData()
    formData.append('type', 'logo')
    formData.append('vendorHint', vendorHint)
    formData.append('file', file, file.name)

    const headers: Record<string, string> = {}
    if (PUBLISHABLE_KEY) {
      headers['x-publishable-api-key'] = PUBLISHABLE_KEY
    }

    try {
      const response = await axios.post(`${API_URL}/store/vendor/uploads`, formData, { headers })
      return response.data as { url?: string; key?: string }
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Upload failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Upload failed', error)
    }
  },

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
    return apiRequest<{ message: string; vendor: any }>('/store/vendors/reapply', {
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
      const response = await axios.post(`${API_URL}/store/vendors/signup`, data, { headers })
      return response.data
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Signup failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Signup failed', error)
    }
  },

  uploadFile: async (file: File, type: 'logo' | 'banner' | 'cancelcheque' | 'doc' | 'pancard', vendorHint: string) => {
    const formData = new FormData()
    formData.append('type', type)
    formData.append('vendorHint', vendorHint)
    formData.append('file', file, file.name)

    const headers: Record<string, string> = {}
    if (PUBLISHABLE_KEY) {
      headers['x-publishable-api-key'] = PUBLISHABLE_KEY
    }

    try {
      const response = await axios.post(`${API_URL}/store/vendor/uploads`, formData, {
        headers,
      })
      return response.data
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Upload failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Upload failed', error)
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
      const response = await axios.post(`${API_URL}/vendors/validate`, { field, value }, { headers })
      return response.data
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Validation failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Validation failed', error)
    }
  },
}

// Vendor Products API
export const vendorProductsApi = {
  list: async () => {
    return apiRequest<{ products: any[] }>('/vendor/products')
  },

  get: async (id: string) => {
    return apiRequest<{ product: any }>(`/vendor/products/${id}`)
  },

  create: async (data: any) => {
    return apiRequest<{ product: any }>('/vendor/products', {
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

  update: async (id: string, data: any) => {
    return apiRequest<{ product: any }>(`/vendor/products/${id}`, {
      method: 'PUT',
      data,
    })
  },

  updateVariants: async (id: string, data: any) => {
    return apiRequest<{ product_id: string; variant_matrix: any; metadata: any }>(
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

  uploadImage: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await axios.post(`${API_URL}/vendor/products/upload-image`, formData, {
        headers,
      })
      return response.data
    } catch (error: any) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data || { message: error.message }
        throw new ApiError(
          error.response?.status || 0,
          errorData.message || 'Upload failed',
          errorData
        )
      }
      throw new ApiError(0, error?.message || 'Upload failed', error)
    }
  },
}

// Vendor Orders API
export const vendorOrdersApi = {
  list: async () => {
    return apiRequest<{ orders: any[]; counts?: Record<string, number> }>('/vendor/orders')
  },

  get: async (id: string) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}`)
  },

  accept: async (id: string) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}/accept`, {
      method: 'POST',
    })
  },

  chooseEasyShipping: async (id: string) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}/shipping`, {
      method: 'POST',
      data: { method: 'easy' },
    })
  },

  chooseSelfShipping: async (
    id: string,
    data: {
      courier_partner_name: string
      tracking_source?: 'shiprocket' | 'carrier_api' | 'manual'
      awb: string
      dispatch_rate: number
      packing_info: string
    }
  ) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}/shipping`, {
      method: 'POST',
      data: { method: 'self', ...data },
    })
  },

  generateInvoice: async (id: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vendor_token') : null
    const response = await axios({
      url: `${API_URL}/vendor/orders/${id}/invoice`,
      method: 'POST',
      responseType: 'blob',
      headers: {
        ...(PUBLISHABLE_KEY ? { 'x-publishable-api-key': PUBLISHABLE_KEY } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    return response.data as Blob
  },

  markReadyToDispatch: async (id: string) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}/rtd`, {
      method: 'POST',
    })
  },

  track: async (id: string) => {
    return apiRequest<{ order: any; tracking: any }>(`/vendor/orders/${id}/track`)
  },
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

export type VendorOrderEarning = {
  id: string
  order_id: string
  order_display_id: string | null
  net_amount: number
  gross_amount: number
  status: 'UNLOCKING' | 'CREDITED' | 'PAID' | 'REVERSED'
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
  } catch (error: any) {
    // Hosted Medusa may not have /summary or /earnings-by-orders yet — use routes that exist.
    if (error?.status === 404) {
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
    return apiRequest<{ payouts: any[]; totals: any; count: number }>('/vendor/payouts')
  },
}

// Vendor Categories API
export const vendorCategoriesApi = {
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.offset) query.append('offset', params.offset.toString())

    const queryString = query.toString()
    return apiRequest<{ product_categories: any[]; count: number }>(
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
    return apiRequest<{ collections: any[]; count: number }>(
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
    return apiRequest<{ product_types: any[]; count: number }>(
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
    return apiRequest<{ product_tags: any[]; count: number }>(
      `/vendor/tags${queryString ? `?${queryString}` : ''}`
    )
  },
}

// Vendor Stats API
export const vendorStatsApi = {
  get: async () => {
    return apiRequest<{ stats: any }>('/vendor/stats')
  },
}

// Vendor Inventory API
export const vendorInventoryApi = {
  list: async () => {
    return apiRequest<{ success: boolean; inventory: any[]; total: number }>('/vendor/inventory')
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
    return apiRequest<{ customers: any[] }>('/vendor/customers')
  },
}

export type VendorReturnRequest = {
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
    condition?: string | null
    reason?: string | null
  }>
  vendor_items: Array<{
    id: string
    title: string
    quantity: number
  }>
  order_total: number | null
}

// Vendor Returns API
export const vendorReturnsApi = {
  list: async () => {
    return apiRequest<{ return_requests: VendorReturnRequest[] }>('/vendor/returns')
  },
}

