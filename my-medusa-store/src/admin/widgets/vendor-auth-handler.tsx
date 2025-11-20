"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"

// This widget intercepts /admin/users/me calls and returns vendor user data
// when a vendor token exists, allowing Admin UI shell to recognize vendor as authenticated

// Set up interceptor immediately (before React renders)
if (typeof window !== 'undefined' && !(window as any).__vendorAuthHandlerInstalled) {
  // Get or store original fetch
  const originalFetch = window.fetch.bind(window)
  if (!(window as any).__originalFetch) {
    ;(window as any).__originalFetch = originalFetch
  }
  
  const fetchWrapper = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.toString() 
        : input instanceof Request
          ? input.url
          : String(input)
    
    // Skip interceptor for login requests and vendor API calls
    if (urlString.endsWith('/vendor/auth/login') || 
        urlString.includes('/auth/user/emailpass') ||
        urlString.includes('/vendor/')) {
      return originalFetch(input, init)
    }
    
    // Get vendor token (if exists)
    const vendorToken = localStorage.getItem("vendor_token")
    
    // If we have a vendor token, intercept admin API calls for vendor data
    // Vendor token takes priority - if it exists, treat as vendor session
    if (vendorToken && vendorToken.trim() !== '' && urlString.includes('/admin/')) {
      
      // Intercept /admin/users/me to return vendor user data
      if (urlString.includes('/admin/users/me')) {
      try {
        const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
        
        // Use originalFetch to avoid circular calls
        const vendorRes = await originalFetch(`${backend}/vendor/me`, {
          headers: { Authorization: `Bearer ${vendorToken}` },
        })
        
        if (vendorRes.ok) {
          const vendorData = await vendorRes.json()
          const vendor = vendorData?.vendor
          
          if (vendor && vendor.is_approved) {
            // Return mock response that Admin UI shell accepts
            const mockResponse = new Response(JSON.stringify({
              user: {
                id: vendor.id,
                email: vendor.email,
                first_name: vendor.name || "",
                last_name: "",
                role: "vendor",
                metadata: {
                  is_vendor: true,
                  vendor_id: vendor.id,
                },
              },
            }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            })
            
            console.log('[Vendor Auth Handler] Returning vendor user data for:', vendor.email)
            return mockResponse
          } else {
            console.log('[Vendor Auth Handler] Vendor not approved')
          }
        } else {
          console.log('[Vendor Auth Handler] Vendor /me request failed:', vendorRes.status)
        }
      } catch (e) {
        console.error('[Vendor Auth Handler] Error fetching vendor data:', e)
      }
      }
      
      // Mock essential admin endpoints that Admin UI shell needs
      // These prevent the shell from crashing when vendor is logged in
      if (urlString.includes('/admin/stores')) {
        return new Response(JSON.stringify({
          stores: [{
            id: 'default',
            name: 'Default Store',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      
      if (urlString.includes('/admin/notifications')) {
        return new Response(JSON.stringify({
          notifications: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      
      // Mock other admin endpoints with empty arrays to prevent errors
      const adminListEndpoints = [
        '/admin/orders',
        '/admin/products',
        '/admin/product-variants',
        '/admin/product-categories',
        '/admin/collections',
        '/admin/customers',
        '/admin/customer-groups',
        '/admin/inventory-items',
        '/admin/promotions',
        '/admin/campaigns',
        '/admin/price-lists',
        '/admin/users',
        '/admin/regions',
        '/admin/tax-regions',
        '/admin/return-reasons',
        '/admin/sales-channels',
        '/admin/product-types',
        '/admin/product-tags',
        '/admin/stock-locations',
        '/admin/shipping-profiles',
        '/admin/api-keys',
      ]
      
      for (const endpoint of adminListEndpoints) {
        if (urlString.includes(endpoint)) {
          return new Response(JSON.stringify({
            [endpoint.split('/').pop() || 'data']: [],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
      
      // For all other admin endpoints, return 401 to indicate vendor doesn't have access
      // This prevents the shell from trying to use admin data
      if (urlString.includes('/admin/')) {
        return new Response(JSON.stringify({
          message: 'Unauthorized - Vendor access only',
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    
    // For all other requests, use original fetch
    return originalFetch(input, init)
  }
  
  // Replace fetch
  window.fetch = fetchWrapper as any
  ;(window as any).__vendorAuthHandlerInstalled = true
  
  console.log('[Vendor Auth Handler] Fetch interceptor installed immediately')
}

const VendorAuthHandler = () => {
  // Component doesn't need to do anything - interceptor is set up above
  return null
}

export const config = defineWidgetConfig({
  zone: "login.after", // Load early to intercept auth calls
})

export default VendorAuthHandler

