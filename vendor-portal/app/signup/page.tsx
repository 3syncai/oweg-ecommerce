'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { vendorSignupApi } from '@/lib/api/client'

type Step = 1 | 2 | 3

export default function SignupPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  
  // Step 1: Personal details
  const [personalData, setPersonalData] = useState({
    firstName: '',
    lastName: '',
    telephone: '',
    email: '',
    password: '',
    passwordConfirm: '',
  })

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const validationTimeouts = useRef<Record<string, NodeJS.Timeout>>({})

  // Step 2: Seller Information
  const [sellerData, setSellerData] = useState({
    storeName: '',
    storePhone: '',
    storeAddress: '',
    storeCountry: 'India',
    storeRegion: '',
    storeCity: '',
    pincode: '',
    shippingPolicy: '',
    returnPolicy: '',
    whatsappNumber: '',
  })
  const [storeLogo, setStoreLogo] = useState<File | null>(null)
  const [storeBanner, setStoreBanner] = useState<File | null>(null)

  // Step 3: Payment Details
  const [paymentData, setPaymentData] = useState({
    bankName: '',
    accountNo: '',
    ifscCode: '',
    gstNo: '',
    panNo: '',
  })
  const [cancelCheque, setCancelCheque] = useState<File | null>(null)
  const [additionalDocuments, setAdditionalDocuments] = useState<File[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Validation functions
  const validatePhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '')
    return digits.length === 10
  }

  const validatePAN = (pan: string): boolean => {
    // PAN format: 5 letters, 4 numbers, 1 letter (e.g., ABCDE1234F)
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
    return panRegex.test(pan.toUpperCase().replace(/\s/g, ''))
  }

  const validateGST = (gst: string): boolean => {
    // GST format: 15 characters (2 state code + 10 PAN + 3 entity number + 1 check digit)
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
    return gstRegex.test(gst.toUpperCase().replace(/\s/g, ''))
  }

  // Check duplicate in database
  const checkDuplicate = async (field: string, value: string) => {
    if (!value || value.trim() === '') {
      setFieldErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
      return
    }

    try {
      const result = await vendorSignupApi.validate(field, value)
      if (result.exists) {
        setFieldErrors((prev) => ({
          ...prev,
          [field]: result.message || `${field} already exists`,
        }))
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field]
          return newErrors
        })
      }
    } catch (err: any) {
      console.error(`Validation error for ${field}:`, err)
    }
  }

  // Debounced validation
  const debouncedValidation = (field: string, value: string, delay: number = 500) => {
    // Clear existing timeout
    if (validationTimeouts.current[field]) {
      clearTimeout(validationTimeouts.current[field])
    }

    // Set new timeout
    validationTimeouts.current[field] = setTimeout(() => {
      checkDuplicate(field, value)
    }, delay)
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(validationTimeouts.current).forEach((timeout) => clearTimeout(timeout))
    }
  }, [])

  const handlePersonalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let processedValue = value

    // For phone number fields, only allow digits
    if (name === 'telephone') {
      processedValue = value.replace(/\D/g, '') // Remove all non-digits
    }

    setPersonalData({
      ...personalData,
      [name]: processedValue,
    })

    // Clear previous error for this field
    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      return newErrors
    })

    // Real-time validation
    if (name === 'telephone') {
      const digits = processedValue.replace(/\D/g, '')
      if (digits.length > 0 && digits.length !== 10) {
        setFieldErrors((prev) => ({
          ...prev,
          [name]: 'Phone number must be exactly 10 digits',
        }))
      } else if (digits.length === 10) {
        // Format is valid, check duplicate
        debouncedValidation('telephone', processedValue)
      }
    } else if (name === 'email') {
      if (processedValue && processedValue.includes('@')) {
        debouncedValidation('email', processedValue)
      }
    }
  }

  const handleSellerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    let processedValue = value

    // For phone number fields, only allow digits
    if (name === 'storePhone' || name === 'whatsappNumber') {
      processedValue = value.replace(/\D/g, '') // Remove all non-digits
    }

    setSellerData({
      ...sellerData,
      [name]: processedValue,
    })

    // Clear previous error for this field
    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      return newErrors
    })

    // Real-time validation for phone numbers
    if (name === 'storePhone') {
      const digits = processedValue.replace(/\D/g, '')
      if (digits.length > 0 && digits.length !== 10) {
        setFieldErrors((prev) => ({
          ...prev,
          [name]: 'Phone number must be exactly 10 digits',
        }))
      } else if (digits.length === 10) {
        // Format is valid, check duplicate
        debouncedValidation('store_phone', processedValue)
      }
    } else if (name === 'whatsappNumber') {
      const digits = processedValue.replace(/\D/g, '')
      if (digits.length > 0 && digits.length !== 10) {
        setFieldErrors((prev) => ({
          ...prev,
          [name]: 'Phone number must be exactly 10 digits',
        }))
      } else if (digits.length === 10) {
        // Format is valid, check duplicate
        debouncedValidation('telephone', processedValue)
      }
    } else if (name === 'storeName') {
      // Check store name duplicate
      if (processedValue.trim().length > 0) {
        debouncedValidation('store_name', processedValue)
      }
    }
  }

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let processedValue = value

    // For PAN and GST, convert to uppercase automatically
    if (name === 'panNo' || name === 'gstNo') {
      processedValue = value.toUpperCase().replace(/\s/g, '')
    }

    setPaymentData({
      ...paymentData,
      [name]: processedValue,
    })

    // Clear previous error for this field
    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      return newErrors
    })

    // Real-time validation
    if (name === 'panNo') {
      const panValue = processedValue
      if (panValue.length > 0) {
        if (!validatePAN(panValue)) {
          setFieldErrors((prev) => ({
            ...prev,
            [name]: 'PAN must be in format: 5 letters, 4 numbers, 1 letter (e.g., ABCDE1234F)',
          }))
        } else {
          // Format is valid, check duplicate
          debouncedValidation('pan_no', panValue)
        }
      }
    } else if (name === 'gstNo') {
      const gstValue = processedValue
      if (gstValue.length > 0) {
        if (!validateGST(gstValue)) {
          setFieldErrors((prev) => ({
            ...prev,
            [name]: 'GST number must be 15 characters in valid format',
          }))
        } else {
          // Format is valid, check duplicate
          debouncedValidation('gst_no', gstValue)
        }
      }
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStoreLogo(e.target.files[0])
    }
  }

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStoreBanner(e.target.files[0])
    }
  }

  const handleCancelChequeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCancelCheque(e.target.files[0])
    }
  }

  const handleAdditionalDocsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAdditionalDocuments(Array.from(e.target.files))
    }
  }

  const validateStep1 = (): boolean => {
    setError('')
    
    if (!personalData.firstName.trim()) {
      setError('First Name is required')
      return false
    }
    if (!personalData.lastName.trim()) {
      setError('Last Name is required')
      return false
    }
    if (!personalData.telephone.trim()) {
      setError('Telephone is required')
      return false
    }
    if (!validatePhone(personalData.telephone)) {
      setError('Phone number must be exactly 10 digits')
      return false
    }
    if (fieldErrors.telephone) {
      setError(fieldErrors.telephone)
      return false
    }
    if (!personalData.email.trim() || !personalData.email.includes('@')) {
      setError('Valid E-Mail is required')
      return false
    }
    if (fieldErrors.email) {
      setError(fieldErrors.email)
      return false
    }
    if (!personalData.password || personalData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return false
    }
    if (personalData.password !== personalData.passwordConfirm) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const validateStep2 = (): boolean => {
    setError('')
    
    if (!sellerData.storeName.trim()) {
      setError('Store Name is required')
      return false
    }
    if (fieldErrors.storeName) {
      setError(fieldErrors.storeName)
      return false
    }
    if (sellerData.storePhone && fieldErrors.store_phone) {
      setError(fieldErrors.store_phone)
      return false
    }
    if (sellerData.storePhone && !validatePhone(sellerData.storePhone)) {
      setError('Store phone number must be exactly 10 digits')
      return false
    }
    return true
  }

  const handleNext = () => {
    setError('')
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2)
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setCurrentStep(3)
      }
    }
  }

  const handlePrevious = () => {
    setError('')
    if (currentStep === 2) {
      setCurrentStep(1)
    } else if (currentStep === 3) {
      setCurrentStep(2)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      let store_logo: string | undefined
      let store_banner: string | undefined
      const uploadedDocuments: Array<{ key: string; url: string; name?: string; type?: string }> = []

      // Get store name for file naming (sanitize it)
      const storeName = sellerData.storeName 
        ? sellerData.storeName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() 
        : personalData.email.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'vendor'

      // Upload store logo if provided
      if (storeLogo) {
        const logoData = await vendorSignupApi.uploadFile(storeLogo, 'logo', storeName)
        store_logo = logoData.files?.[0]?.url
      }

      // Upload store banner if provided
      if (storeBanner) {
        const bannerData = await vendorSignupApi.uploadFile(storeBanner, 'banner', storeName)
        store_banner = bannerData.files?.[0]?.url
        if (store_banner) {
          uploadedDocuments.push({
            key: bannerData.files?.[0]?.key || '',
            url: store_banner,
            name: storeBanner.name,
            type: storeBanner.type,
          })
        }
      }

      // Upload cancel cheque if provided
      if (cancelCheque) {
        const chequeData = await vendorSignupApi.uploadFile(cancelCheque, 'cancelcheque', storeName)
        const file = chequeData.files?.[0]
        if (file) {
          uploadedDocuments.push({
            key: file.key,
            url: file.url,
            name: cancelCheque.name,
            type: cancelCheque.type,
          })
        }
      }

      // Upload additional documents if provided
      for (const doc of additionalDocuments) {
        if (doc) {
          const docData = await vendorSignupApi.uploadFile(doc, 'doc', storeName)
          const file = docData.files?.[0]
          if (file) {
            uploadedDocuments.push({
              key: file.key,
              url: file.url,
              name: doc.name,
              type: doc.type,
            })
          }
        }
      }

      // Find cancel cheque URL from uploaded documents
      const cancelChequeDoc = uploadedDocuments.find(doc => doc.name === cancelCheque?.name)

      // Submit signup with all fields
      await vendorSignupApi.signup({
        // Personal Information
        name: `${personalData.firstName} ${personalData.lastName}`.trim(),
        firstName: personalData.firstName || undefined,
        lastName: personalData.lastName || undefined,
        email: personalData.email,
        phone: personalData.telephone || undefined,
        telephone: personalData.telephone || undefined,

        // Store Information
        store_name: sellerData.storeName || undefined,
        store_phone: sellerData.storePhone || undefined,
        store_address: sellerData.storeAddress || undefined,
        store_country: sellerData.storeCountry || undefined,
        store_region: sellerData.storeRegion || undefined,
        store_city: sellerData.storeCity || undefined,
        store_pincode: sellerData.pincode || undefined,
        store_logo,
        store_banner,
        shipping_policy: sellerData.shippingPolicy || undefined,
        return_policy: sellerData.returnPolicy || undefined,
        whatsapp_number: sellerData.whatsappNumber || undefined,

        // Tax & Legal Information
        pan_gst: [paymentData.gstNo, paymentData.panNo].filter(Boolean).join(' / ') || undefined, // Legacy combined
        gst_no: paymentData.gstNo || undefined,
        pan_no: paymentData.panNo || undefined,

        // Banking Information
        bank_name: paymentData.bankName || undefined,
        account_no: paymentData.accountNo || undefined,
        ifsc_code: paymentData.ifscCode || undefined,
        cancel_cheque_url: cancelChequeDoc?.url || undefined,

        // Documents
        documents: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,

        // Password
        password: personalData.password || undefined,
      })

      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
          <div className="text-center">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900">Signup Successful!</h2>
            <p className="mt-2 text-gray-600">
              Your vendor account has been submitted for approval. You will be redirected to login...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Seller Registration</h1>
            <p className="text-gray-600">
              Already a vendor?{' '}
              <Link href="/login" className="text-blue-600 hover:text-blue-500">
                Sign in here
              </Link>
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              {/* Step 1 */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  currentStep >= 1 ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 1 ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  )}
                </div>
                <div className="ml-2">
                  <p className={`text-sm font-medium ${currentStep >= 1 ? 'text-green-500' : 'text-gray-500'}`}>
                    Personal details
                  </p>
                </div>
              </div>
              <div className={`w-16 h-1 mx-4 ${currentStep >= 2 ? 'bg-green-500' : 'bg-gray-300'}`} />

              {/* Step 2 */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  currentStep >= 2 ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="ml-2">
                  <p className={`text-sm font-medium ${currentStep >= 2 ? 'text-green-500' : 'text-gray-500'}`}>
                    Seller Information
                  </p>
                </div>
              </div>
              <div className={`w-16 h-1 mx-4 ${currentStep >= 3 ? 'bg-green-500' : 'bg-gray-300'}`} />

              {/* Step 3 */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  currentStep >= 3 ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="ml-2">
                  <p className={`text-sm font-medium ${currentStep >= 3 ? 'text-green-500' : 'text-gray-500'}`}>
                    Payment Details
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}

            {/* Step 1: Personal Details */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      required
                      value={personalData.firstName}
                      onChange={handlePersonalChange}
                      placeholder="First Name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      required
                      value={personalData.lastName}
                      onChange={handlePersonalChange}
                      placeholder="Last Name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="telephone" className="block text-sm font-medium text-gray-700 mb-1">
                      Telephone *
                    </label>
                    <input
                      id="telephone"
                      name="telephone"
                      type="tel"
                      required
                      maxLength={10}
                      value={personalData.telephone}
                      onChange={handlePersonalChange}
                      placeholder="10 digit phone number"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.telephone
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.telephone && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.telephone}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      E-Mail *
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={personalData.email}
                      onChange={handlePersonalChange}
                      placeholder="E-Mail"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.email
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.email && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Password *
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={personalData.password}
                      onChange={handlePersonalChange}
                      placeholder="Password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700 mb-1">
                      Password Confirm *
                    </label>
                    <input
                      id="passwordConfirm"
                      name="passwordConfirm"
                      type="password"
                      required
                      value={personalData.passwordConfirm}
                      onChange={handlePersonalChange}
                      placeholder="Password Confirm"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Seller Information */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Name *
                    </label>
                    <input
                      id="storeName"
                      name="storeName"
                      type="text"
                      required
                      value={sellerData.storeName}
                      onChange={handleSellerChange}
                      placeholder="Store Name"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.storeName
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.storeName && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.storeName}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="storePhone" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Phone
                    </label>
                    <input
                      id="storePhone"
                      name="storePhone"
                      type="tel"
                      maxLength={10}
                      value={sellerData.storePhone}
                      onChange={handleSellerChange}
                      onKeyPress={(e) => {
                        // Only allow digits
                        if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
                          e.preventDefault()
                        }
                      }}
                      placeholder="10 digit phone number"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.storePhone || fieldErrors.store_phone
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.storePhone && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.storePhone}</p>
                    )}
                    {fieldErrors.store_phone && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.store_phone}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="storeLogo" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Logo
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="storeLogo"
                        name="storeLogo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="storeLogo"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md cursor-pointer hover:bg-gray-200"
                      >
                        Choose File
                      </label>
                      <span className="text-sm text-gray-500">
                        {storeLogo ? storeLogo.name : 'No file chosen'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Upload your store logo JPG, PNG</p>
                  </div>
                  <div>
                    <label htmlFor="storeBanner" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Banner
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="storeBanner"
                        name="storeBanner"
                        type="file"
                        accept="image/*"
                        onChange={handleBannerChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="storeBanner"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md cursor-pointer hover:bg-gray-200"
                      >
                        Choose File
                      </label>
                      <span className="text-sm text-gray-500">
                        {storeBanner ? storeBanner.name : 'No file chosen'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Upload your store banner image</p>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="storeAddress" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Address
                    </label>
                    <textarea
                      id="storeAddress"
                      name="storeAddress"
                      value={sellerData.storeAddress}
                      onChange={handleSellerChange}
                      placeholder="Store Address"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="storeCountry" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Country
                    </label>
                    <input
                      id="storeCountry"
                      name="storeCountry"
                      type="text"
                      value={sellerData.storeCountry}
                      onChange={handleSellerChange}
                      placeholder="Store Country"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="storeRegion" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Region / State
                    </label>
                    <input
                      id="storeRegion"
                      name="storeRegion"
                      type="text"
                      value={sellerData.storeRegion}
                      onChange={handleSellerChange}
                      placeholder="Store Region / State"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="storeCity" className="block text-sm font-medium text-gray-700 mb-1">
                      Store City
                    </label>
                    <input
                      id="storeCity"
                      name="storeCity"
                      type="text"
                      value={sellerData.storeCity}
                      onChange={handleSellerChange}
                      placeholder="Store City"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="pincode" className="block text-sm font-medium text-gray-700 mb-1">
                      Pincode
                    </label>
                    <input
                      id="pincode"
                      name="pincode"
                      type="text"
                      value={sellerData.pincode}
                      onChange={handleSellerChange}
                      placeholder="Pincode"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="shippingPolicy" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Shipping Policy
                    </label>
                    <textarea
                      id="shippingPolicy"
                      name="shippingPolicy"
                      value={sellerData.shippingPolicy}
                      onChange={handleSellerChange}
                      placeholder="Store Shipping Policy"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="returnPolicy" className="block text-sm font-medium text-gray-700 mb-1">
                      Store Return Policy
                    </label>
                    <textarea
                      id="returnPolicy"
                      name="returnPolicy"
                      value={sellerData.returnPolicy}
                      onChange={handleSellerChange}
                      placeholder="Store Return Policy"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="whatsappNumber" className="block text-sm font-medium text-gray-700 mb-1">
                      WhatsApp Number
                    </label>
                    <input
                      id="whatsappNumber"
                      name="whatsappNumber"
                      type="tel"
                      maxLength={10}
                      value={sellerData.whatsappNumber}
                      onChange={handleSellerChange}
                      onKeyPress={(e) => {
                        // Only allow digits
                        if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
                          e.preventDefault()
                        }
                      }}
                      placeholder="10 digit phone number"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.whatsappNumber
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.whatsappNumber && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.whatsappNumber}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between mt-6">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Payment Details */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      id="bankName"
                      name="bankName"
                      type="text"
                      value={paymentData.bankName}
                      onChange={handlePaymentChange}
                      placeholder="Bank Name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="accountNo" className="block text-sm font-medium text-gray-700 mb-1">
                      Account No
                    </label>
                    <input
                      id="accountNo"
                      name="accountNo"
                      type="text"
                      value={paymentData.accountNo}
                      onChange={handlePaymentChange}
                      placeholder="Bank No"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="ifscCode" className="block text-sm font-medium text-gray-700 mb-1">
                      IFSC Code
                    </label>
                    <input
                      id="ifscCode"
                      name="ifscCode"
                      type="text"
                      value={paymentData.ifscCode}
                      onChange={handlePaymentChange}
                      placeholder="IFSC Code"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="gstNo" className="block text-sm font-medium text-gray-700 mb-1">
                      GST No
                    </label>
                    <input
                      id="gstNo"
                      name="gstNo"
                      type="text"
                      value={paymentData.gstNo}
                      onChange={handlePaymentChange}
                      placeholder="15 character GST number"
                      maxLength={15}
                      style={{ textTransform: 'uppercase' }}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                        fieldErrors.gstNo
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    {fieldErrors.gstNo && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.gstNo}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="panNo" className="block text-sm font-medium text-gray-700 mb-1">
                      PAN No
                    </label>
                    <input
                      id="panNo"
                      name="panNo"
                      type="text"
                      value={paymentData.panNo}
                      onChange={handlePaymentChange}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${
                        fieldErrors.panNo
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                      style={{ textTransform: 'uppercase' }}
                    />
                    {fieldErrors.panNo && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.panNo}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cancelCheque" className="block text-sm font-medium text-gray-700 mb-1">
                      Cancel Cheque
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="cancelCheque"
                        name="cancelCheque"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleCancelChequeChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="cancelCheque"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md cursor-pointer hover:bg-gray-200"
                      >
                        Choose File
                      </label>
                      <span className="text-sm text-gray-500">
                        {cancelCheque ? cancelCheque.name : 'No file chosen'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Upload cancelled cheque (Image or PDF)</p>
                  </div>
                  <div>
                    <label htmlFor="additionalDocuments" className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Documents
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="additionalDocuments"
                        name="additionalDocuments"
                        type="file"
                        multiple
                        onChange={handleAdditionalDocsChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="additionalDocuments"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md cursor-pointer hover:bg-gray-200"
                      >
                        Choose Files
                      </label>
                      <span className="text-sm text-gray-500">
                        {additionalDocuments.length > 0 ? `${additionalDocuments.length} file(s) chosen` : 'No file chosen'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Upload any additional documents</p>
                  </div>
                </div>
                <div className="flex justify-between mt-6">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Previous
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
