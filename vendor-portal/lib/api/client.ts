/**
 * API Client for Medusa Backend
 * Handles all API requests to the vendor endpoints
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios'

// Get API URL - in Next.js, NEXT_PUBLIC_* vars are available on client
const API_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000')
  : (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000')

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
        console.error('Network error - Failed to fetch:', {
          url,
          endpoint,
          apiUrl: API_URL,
          error: error.message
        })
        throw new ApiError(
          0,
          `Network error: Unable to reach backend at ${API_URL}. Please check if the backend is running and CORS is configured correctly.`,
          { originalError: error.message, url }
        )
      }

      const errorData = error.response?.data || { message: error.message }
      throw new ApiError(
        error.response?.status || 0,
        errorData.message || 'API request failed',
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
    return apiRequest('/vendor/auth/change-password', {
      method: 'POST',
      data: { current_password: currentPassword, new_password: newPassword },
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
    documents?: Array<{ key: string; url: string; name?: string; type?: string }> | null
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
    documents?: Array<{ key: string; url: string; name?: string; type?: string }>

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

  uploadFile: async (file: File, type: 'logo' | 'banner' | 'cancelcheque' | 'doc', vendorHint: string) => {
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

  update: async (id: string, data: any) => {
    return apiRequest<{ product: any }>(`/vendor/products/${id}`, {
      method: 'PUT',
      data,
    })
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
    return apiRequest<{ orders: any[] }>('/vendor/orders')
  },

  get: async (id: string) => {
    return apiRequest<{ order: any }>(`/vendor/orders/${id}`)
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

