'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { vendorProfileApi } from '@/lib/api/client'

export default function PendingPage() {
  const router = useRouter()
  const [vendor, setVendor] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkStatus = async () => {
      const token = localStorage.getItem('vendor_token')
      if (!token) {
        router.push('/login')
        return
      }

      try {
        const response = await vendorProfileApi.getMe()
        const vendorData = response.vendor

        // If vendor is rejected, redirect to reapply page
        if (vendorData.rejected_at) {
          router.push('/reapply')
          return
        }

        // If vendor is approved, redirect to dashboard
        if (vendorData.is_approved) {
          router.push('/dashboard')
          return
        }

        setVendor(vendorData)
      } catch (error: any) {
        // If 403, vendor is not approved (expected)
        if (error.status === 403) {
          // Try to get vendor info from token or show generic message
          setVendor({ is_approved: false })
        } else {
          console.error('Error checking vendor status:', error)
        }
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('vendor_token')
    localStorage.removeItem('vendor_user')
    // Clear cookie as well
    document.cookie = 'vendor_token=; path=/; max-age=0; SameSite=Lax'
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Pending Approval</h2>
          <p className="text-gray-600 mb-6">
            Your vendor account is currently pending admin approval.
          </p>
          {vendor && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-blue-800">
                <strong>Account Details:</strong>
              </p>
              {vendor.email && (
                <p className="text-sm text-blue-700 mt-1">Email: {vendor.email}</p>
              )}
              {vendor.store_name && (
                <p className="text-sm text-blue-700">Store: {vendor.store_name}</p>
              )}
            </div>
          )}
          <p className="text-sm text-gray-500 mb-6">
            You will be notified once your account has been approved. Please check back later or contact support if you have any questions.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

