'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { vendorProfileApi } from '@/lib/api/client'

export default function ReapplyPage() {
  const router = useRouter()
  const [vendor, setVendor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [reapplying, setReapplying] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    const loadVendor = async () => {
      const token = localStorage.getItem('vendor_token')
      if (!token) {
        router.push('/login')
        return
      }

      try {
        const response = await vendorProfileApi.getMe()
        const vendorData = response.vendor

        // Check vendor status
        if (vendorData.is_approved) {
          router.push('/dashboard')
          return
        }

        if (!vendorData.rejected_at) {
          router.push('/pending')
          return
        }

        // Vendor is rejected - show reapply form
        setVendor(vendorData)

        // Initialize form data
        setFormData({
          name: vendorData.name || '',
          firstName: vendorData.first_name || '',
          lastName: vendorData.last_name || '',
          phone: vendorData.phone || '',
          telephone: vendorData.telephone || '',
          store_name: vendorData.store_name || '',
          store_phone: vendorData.store_phone || '',
          store_address: vendorData.store_address || '',
          store_country: vendorData.store_country || '',
          store_region: vendorData.store_region || '',
          store_city: vendorData.store_city || '',
          store_pincode: vendorData.store_pincode || '',
          whatsapp_number: vendorData.whatsapp_number || '',
          pan_gst: vendorData.pan_gst || '',
          gst_no: vendorData.gst_no || '',
          pan_no: vendorData.pan_no || '',
          bank_name: vendorData.bank_name || '',
          account_no: vendorData.account_no || '',
          ifsc_code: vendorData.ifsc_code || '',
          shipping_policy: vendorData.shipping_policy || '',
          return_policy: vendorData.return_policy || '',
        })
      } catch (error: any) {
        console.error('Error loading vendor:', error)
        if (error.status === 401) {
          router.push('/login')
          return
        }
        setError(error.message || 'Failed to load vendor details')
      } finally {
        setLoading(false)
      }
    }

    loadVendor()
  }, [router])

  const isFieldFilled = (value: any): boolean => {
    return value !== null && value !== undefined && value !== '' && String(value).trim() !== ''
  }

  const getMissingFields = (): string[] => {
    if (!vendor) return []
    const missing: string[] = []
    if (!formData.firstName?.trim()) missing.push('First Name')
    if (!formData.lastName?.trim()) missing.push('Last Name')
    if (!formData.phone?.trim()) missing.push('Phone')
    if (!formData.store_name?.trim()) missing.push('Store Name')
    if (!formData.store_address?.trim()) missing.push('Store Address')
    if (!formData.store_city?.trim()) missing.push('Store City')
    if (!formData.store_country?.trim()) missing.push('Store Country')
    if (!formData.store_pincode?.trim()) missing.push('Store Pincode')
    if (!formData.gst_no?.trim() && !formData.pan_gst?.trim()) missing.push('GST Number')
    if (!formData.pan_no?.trim() && !formData.pan_gst?.trim()) missing.push('PAN Number')
    if (!formData.bank_name?.trim()) missing.push('Bank Name')
    if (!formData.account_no?.trim()) missing.push('Account Number')
    if (!formData.ifsc_code?.trim()) missing.push('IFSC Code')
    if (!vendor.cancel_cheque_url) missing.push('Cancel Cheque')
    if (!vendor.documents || vendor.documents.length === 0) missing.push('Documents')
    return missing
  }

  const handleReapply = async () => {
    setReapplying(true)
    setError('')

    try {
      await vendorProfileApi.reapply(formData)
      
      // Redirect to pending page after successful reapply
      router.push('/pending')
    } catch (err: any) {
      setError(err.message || 'Failed to reapply')
    } finally {
      setReapplying(false)
    }
  }

  const updateFormField = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value,
    }))
  }

  const renderField = (label: string, field: string, type: string = 'text', multiline: boolean = false) => {
    const value = formData[field] || ''
    const filled = isFieldFilled(value)

    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {!filled && <span className="text-red-500">*</span>}
        </label>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => updateFormField(field, e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}`}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              !filled ? 'border-orange-300' : 'border-gray-300'
            }`}
            rows={4}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => updateFormField(field, e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}`}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              !filled ? 'border-orange-300' : 'border-gray-300'
            }`}
          />
        )}
        <div className={`text-xs mt-1 ${filled ? 'text-green-600' : 'text-orange-600'}`}>
          {filled ? '✓ Filled' : '✗ Missing'}
        </div>
      </div>
    )
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

  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow">
          <div className="text-center">
            {error ? (
              <>
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Try Again
                </button>
              </>
            ) : (
              <p className="text-gray-600">No vendor data found</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const missingFields = getMissingFields()

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendor Reapply</h1>
          <p className="text-gray-600">Update your details and reapply for vendor approval</p>
        </div>

        {/* Rejection Notice */}
        {vendor.rejection_reason && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-orange-900 mb-2">Rejection Notice</h2>
                <p className="text-sm text-orange-800 whitespace-pre-wrap">{vendor.rejection_reason}</p>
                {vendor.rejected_at && (
                  <p className="text-xs text-orange-600 mt-2">
                    Rejected on: {new Date(vendor.rejected_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Missing Fields Summary */}
        {missingFields.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-yellow-800 mb-2">
              Missing Required Fields ({missingFields.length}):
            </p>
            <ul className="list-disc list-inside text-sm text-yellow-700">
              {missingFields.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-6">Account Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField('Name', 'name')}
            {renderField('First Name', 'firstName')}
            {renderField('Last Name', 'lastName')}
            {renderField('Phone', 'phone', 'tel')}
            {renderField('Telephone', 'telephone', 'tel')}
          </div>

          <h2 className="text-xl font-semibold mb-6 mt-8">Store Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField('Store Name', 'store_name')}
            {renderField('Store Phone', 'store_phone', 'tel')}
            {renderField('Store Country', 'store_country')}
            {renderField('Store Region', 'store_region')}
            {renderField('Store City', 'store_city')}
            {renderField('Store Pincode', 'store_pincode')}
            {renderField('WhatsApp Number', 'whatsapp_number', 'tel')}
          </div>

          <div className="mt-4">
            {renderField('Store Address', 'store_address', 'text', true)}
          </div>

          <h2 className="text-xl font-semibold mb-6 mt-8">Tax & Legal Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField('GST Number', 'gst_no')}
            {renderField('PAN Number', 'pan_no')}
            {renderField('PAN/GST', 'pan_gst')}
          </div>

          <h2 className="text-xl font-semibold mb-6 mt-8">Banking Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField('Bank Name', 'bank_name')}
            {renderField('Account Number', 'account_no')}
            {renderField('IFSC Code', 'ifsc_code')}
          </div>

          <h2 className="text-xl font-semibold mb-6 mt-8">Policies</h2>

          <div className="grid grid-cols-1 gap-4">
            {renderField('Shipping Policy', 'shipping_policy', 'text', true)}
            {renderField('Return Policy', 'return_policy', 'text', true)}
          </div>

          {/* Submit Button */}
          <div className="mt-8 flex justify-end gap-4">
            <button
              onClick={() => router.push('/pending')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReapply}
              disabled={reapplying}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {reapplying ? 'Reapplying...' : 'Reapply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

