'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { vendorSignupApi } from '@/lib/api/client'

type Step = 1 | 2 | 3

const STEP_META: Array<{ id: Step; label: string; description: string }> = [
  { id: 1, label: 'Personal details', description: 'Tell us about you' },
  { id: 2, label: 'Seller Information', description: 'Set up your storefront' },
  { id: 3, label: 'Payment Details', description: 'Add payment & legal info' },
]

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

  // Prevents accidental submit when moving onto step 3 (e.g. double-click on
  // the Next button where the second click lands on the now-Submit button at
  // the same screen position). The submit is only "armed" a short moment
  // after the user has actually arrived on step 3.
  const [step3Armed, setStep3Armed] = useState(false)
  useEffect(() => {
    if (currentStep !== 3) {
      setStep3Armed(false)
      return
    }
    const t = setTimeout(() => setStep3Armed(true), 450)
    return () => clearTimeout(t)
  }, [currentStep])

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

  const validateIFSC = (ifsc: string): boolean => {
    // IFSC format: 4 letters + 0 + 6 alphanumeric
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
    return ifscRegex.test(ifsc.toUpperCase().replace(/\s/g, ''))
  }

  const validateAccountNo = (account: string): boolean => {
    // Indian bank account numbers are typically 9-18 digits
    const digits = account.replace(/\D/g, '')
    return digits.length >= 9 && digits.length <= 18 && digits === account.replace(/\s/g, '')
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
    if (validationTimeouts.current[field]) {
      clearTimeout(validationTimeouts.current[field])
    }

    validationTimeouts.current[field] = setTimeout(() => {
      checkDuplicate(field, value)
    }, delay)
  }

  useEffect(() => {
    return () => {
      Object.values(validationTimeouts.current).forEach((timeout) => clearTimeout(timeout))
    }
  }, [])

  const handlePersonalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let processedValue = value

    if (name === 'telephone') {
      processedValue = value.replace(/\D/g, '')
    }

    setPersonalData({
      ...personalData,
      [name]: processedValue,
    })

    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      return newErrors
    })

    if (name === 'telephone') {
      const digits = processedValue.replace(/\D/g, '')
      if (digits.length > 0 && digits.length !== 10) {
        setFieldErrors((prev) => ({
          ...prev,
          [name]: 'Phone number must be exactly 10 digits',
        }))
      } else if (digits.length === 10) {
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

    if (name === 'storePhone' || name === 'whatsappNumber') {
      processedValue = value.replace(/\D/g, '')
    }

    setSellerData({
      ...sellerData,
      [name]: processedValue,
    })

    // Also clear the snake_case mirror keys the duplicate-check writes to,
    // so a stale "already exists" message doesn't linger between keystrokes.
    const snakeKey =
      name === 'storeName'
        ? 'store_name'
        : name === 'storePhone'
          ? 'store_phone'
          : name === 'whatsappNumber'
            ? 'telephone'
            : null
    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      if (snakeKey) delete newErrors[snakeKey]
      return newErrors
    })

    if (name === 'storePhone') {
      const digits = processedValue.replace(/\D/g, '')
      if (digits.length > 0 && digits.length !== 10) {
        setFieldErrors((prev) => ({
          ...prev,
          [name]: 'Phone number must be exactly 10 digits',
        }))
      } else if (digits.length === 10) {
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
        debouncedValidation('telephone', processedValue)
      }
    } else if (name === 'storeName') {
      if (processedValue.trim().length > 0) {
        debouncedValidation('store_name', processedValue)
      }
    }
  }

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    let processedValue = value

    if (name === 'panNo' || name === 'gstNo') {
      processedValue = value.toUpperCase().replace(/\s/g, '')
    }

    setPaymentData({
      ...paymentData,
      [name]: processedValue,
    })

    setFieldErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[name]
      return newErrors
    })

    if (name === 'panNo') {
      const panValue = processedValue
      if (panValue.length > 0) {
        if (!validatePAN(panValue)) {
          setFieldErrors((prev) => ({
            ...prev,
            [name]: 'PAN must be in format: 5 letters, 4 numbers, 1 letter (e.g., ABCDE1234F)',
          }))
        } else {
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
    if (fieldErrors.store_name) {
      setError(fieldErrors.store_name)
      return false
    }
    if (!sellerData.storePhone.trim()) {
      setError('Store Phone is required')
      return false
    }
    if (!validatePhone(sellerData.storePhone)) {
      setError('Store phone number must be exactly 10 digits')
      return false
    }
    if (fieldErrors.storePhone) {
      setError(fieldErrors.storePhone)
      return false
    }
    if (fieldErrors.store_phone) {
      setError(fieldErrors.store_phone)
      return false
    }
    if (!sellerData.whatsappNumber.trim()) {
      setError('WhatsApp Number is required')
      return false
    }
    if (!validatePhone(sellerData.whatsappNumber)) {
      setError('WhatsApp number must be exactly 10 digits')
      return false
    }
    if (fieldErrors.whatsappNumber) {
      setError(fieldErrors.whatsappNumber)
      return false
    }
    return true
  }

  const validateStep3 = (): boolean => {
    setError('')

    if (!paymentData.bankName.trim()) {
      setError('Bank Name is required')
      return false
    }
    if (!paymentData.accountNo.trim()) {
      setError('Account Number is required')
      return false
    }
    if (!validateAccountNo(paymentData.accountNo)) {
      setError('Account Number must be 9–18 digits with no other characters')
      return false
    }
    if (!paymentData.ifscCode.trim()) {
      setError('IFSC Code is required')
      return false
    }
    if (!validateIFSC(paymentData.ifscCode)) {
      setError('IFSC Code must be in format AAAA0XXXXXX (4 letters, 0, 6 alphanumeric)')
      return false
    }
    if (!cancelCheque) {
      setError('Cancel Cheque is required')
      return false
    }
    if (!paymentData.gstNo.trim()) {
      setError('GST Number is required')
      return false
    }
    if (!validateGST(paymentData.gstNo)) {
      setError('GST number must be 15 characters in valid format')
      return false
    }
    if (fieldErrors.gstNo || fieldErrors.gst_no) {
      setError(fieldErrors.gstNo || fieldErrors.gst_no || 'GST number is invalid')
      return false
    }
    if (!paymentData.panNo.trim()) {
      setError('PAN Number is required')
      return false
    }
    if (!validatePAN(paymentData.panNo)) {
      setError('PAN must be in format ABCDE1234F (5 letters, 4 numbers, 1 letter)')
      return false
    }
    if (fieldErrors.panNo || fieldErrors.pan_no) {
      setError(fieldErrors.panNo || fieldErrors.pan_no || 'PAN number is invalid')
      return false
    }
    if (additionalDocuments.length === 0) {
      setError('PAN Card is required')
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

  // Stepper navigation: jump backward freely; forward requires prior steps to validate
  const goToStep = (target: Step) => {
    if (target === currentStep) return
    setError('')

    if (target < currentStep) {
      setCurrentStep(target)
      return
    }

    // Going forward: validate every step from current up to (target - 1)
    for (let s = currentStep as number; s < (target as number); s++) {
      if (s === 1 && !validateStep1()) return
      if (s === 2 && !validateStep2()) return
    }
    setCurrentStep(target)
  }

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault()

    // Hard guard: only fire the real API submission when the user is on
    // step 3 AND the submit has been "armed" (see step3Armed effect). This
    // blocks Enter-key submits from earlier steps and double-click submits
    // that hit the Submit button immediately after advancing to step 3.
    if (currentStep !== 3 || !step3Armed) {
      return
    }

    // Final required-field / format validation for step 3.
    if (!validateStep3()) {
      return
    }

    setLoading(true)
    setError('')

    try {
      let store_logo: string | undefined
      let store_banner: string | undefined
      const uploadedDocuments: Array<{ key: string; url: string; name?: string; type?: string }> = []

      const storeName = sellerData.storeName
        ? sellerData.storeName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
        : personalData.email.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'vendor'

      if (storeLogo) {
        const logoData = await vendorSignupApi.uploadFile(storeLogo, 'logo', storeName)
        store_logo = logoData.files?.[0]?.url
      }

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

      const cancelChequeDoc = uploadedDocuments.find(doc => doc.name === cancelCheque?.name)

      await vendorSignupApi.signup({
        name: `${personalData.firstName} ${personalData.lastName}`.trim(),
        firstName: personalData.firstName || undefined,
        lastName: personalData.lastName || undefined,
        email: personalData.email,
        phone: personalData.telephone || undefined,
        telephone: personalData.telephone || undefined,

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

        pan_gst: [paymentData.gstNo, paymentData.panNo].filter(Boolean).join(' / ') || undefined,
        gst_no: paymentData.gstNo || undefined,
        pan_no: paymentData.panNo || undefined,

        bank_name: paymentData.bankName || undefined,
        account_no: paymentData.accountNo || undefined,
        ifsc_code: paymentData.ifscCode || undefined,
        cancel_cheque_url: cancelChequeDoc?.url || undefined,

        documents: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,

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

  // ----------------------------------------------------------------
  // Reusable input class (matches login page polish)
  // ----------------------------------------------------------------
  const inputBase =
    'w-full px-3.5 py-2.5 bg-slate-50 border rounded-lg text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:bg-white hover:border-slate-300 transition'
  const inputOk = 'border-slate-200 focus:border-green-500'
  const inputErr = 'border-red-500 focus:border-red-500'

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
        style={{ colorScheme: 'light' }}
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 ring-8 ring-emerald-50 mb-6">
            <svg
              className="w-10 h-10 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Application submitted!</h2>
          <p className="mt-2 text-gray-600">
            Your vendor account has been submitted for approval. You will be redirected to login shortly.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Redirecting to login…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-gray-50" style={{ colorScheme: 'light' }}>
      {/* ────────────────────────────────────────────────────────────
          Left Panel - Branded Hero (mirrors login page styling)
          ──────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:w-2/5 xl:w-[44%] lg:sticky lg:top-0 lg:h-screen bg-gradient-to-br from-green-600 via-green-700 to-emerald-900 p-12 flex-col justify-between relative overflow-hidden">
        {/* Soft animated blobs */}
        <div className="absolute inset-0 opacity-25 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-96 h-96 bg-emerald-300 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-lime-300 rounded-full blur-3xl animate-pulse [animation-delay:1500ms]" />
        </div>

        {/* Subtle grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Hero Oweg 3D logo, floating behind text */}
        <div
          aria-hidden
          className="absolute -right-24 top-1/2 -translate-y-1/2 w-[42rem] h-[42rem] pointer-events-none select-none animate-float"
        >
          <div className="absolute inset-0 bg-emerald-400/30 rounded-full blur-[120px]" />
          <Image
            src="/Oweg3d-400.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 44vw, 100vw"
            className="object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]"
            unoptimized
          />
        </div>

        {/* Small decorative logo, top-right */}
        <div
          aria-hidden
          className="absolute top-12 right-12 w-24 h-24 opacity-30 animate-float-slow pointer-events-none select-none"
        >
          <Image src="/Oweg3d-400.png" alt="" fill sizes="96px" className="object-contain" unoptimized />
        </div>

        {/* Foreground content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-md ring-1 ring-white/30 flex items-center justify-center overflow-hidden">
              <Image
                src="/Oweg3d-400.png"
                alt="OWEG"
                width={36}
                height={36}
                className="object-contain"
                unoptimized
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white leading-none">OWEG</h1>
              <p className="text-emerald-100/80 text-xs tracking-widest uppercase mt-1">Vendor Portal</p>
            </div>
          </div>

          <div className="mt-12 max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              Join thousands of sellers across India
            </span>
            <h2 className="mt-5 text-4xl font-bold text-white leading-tight tracking-tight">
              Start selling on
              <br />
              <span className="bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent">
                OWEG today
              </span>
            </h2>
            <p className="mt-5 text-emerald-50/90 text-base leading-relaxed">
              Create your seller account in a few easy steps and reach customers across the country.
            </p>

            {/* Step-aware progress guide */}
            <ul className="mt-8 space-y-3">
              {STEP_META.map((step) => {
                const isComplete = currentStep > step.id
                const isActive = currentStep === step.id
                return (
                  <li
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 transition-all duration-300 ${
                      isActive
                        ? 'bg-white/15 ring-white/30 backdrop-blur-md'
                        : 'bg-white/0 ring-white/5'
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                        isComplete
                          ? 'bg-emerald-300 text-emerald-900'
                          : isActive
                            ? 'bg-white text-emerald-700'
                            : 'bg-white/15 text-white/70 ring-1 ring-white/20'
                      }`}
                      aria-hidden="true"
                    >
                      {isComplete ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.id
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold leading-tight transition-colors ${
                          isActive || isComplete ? 'text-white' : 'text-white/60'
                        }`}
                      >
                        {step.description}
                      </p>
                      <p
                        className={`text-xs leading-tight mt-0.5 transition-colors ${
                          isActive ? 'text-emerald-100/90' : 'text-white/40'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Footer trust pills */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 text-white/90 text-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 ring-1 ring-white/15">
            <svg className="w-4 h-4 text-emerald-200" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Quick approval</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 ring-1 ring-white/15">
            <svg className="w-4 h-4 text-emerald-200" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>Secure & encrypted</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 ring-1 ring-white/15">
            <svg className="w-4 h-4 text-emerald-200" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.481-.1-.879-.282-1.165-.485a.75.75 0 10-.87 1.221c.589.418 1.331.674 2.035.764v.091a.75.75 0 001.5 0v-.091a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0010.75 9.092V7.151c.481.1.879.282 1.165.485a.75.75 0 00.87-1.221 4.535 4.535 0 00-2.035-.764V6.75z"
                clipRule="evenodd"
              />
            </svg>
            <span>Free to join</span>
          </div>
        </div>
      </aside>

      {/* ────────────────────────────────────────────────────────────
          Right Panel - Form column
          ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile-only header */}
        <div className="lg:hidden flex items-center justify-between px-4 pt-6 pb-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center overflow-hidden ring-1 ring-emerald-200">
              <Image
                src="/Oweg3d-400.png"
                alt="OWEG"
                width={28}
                height={28}
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-gray-900">OWEG</p>
              <p className="text-[10px] tracking-widest uppercase text-gray-500">Vendor Portal</p>
            </div>
          </Link>
          <Link href="/login" className="text-sm font-medium text-green-600 hover:text-green-700">
            Sign in
          </Link>
        </div>

        {/* Sticky Stepper */}
        <div className="sticky top-0 z-20 bg-gray-50/85 backdrop-blur-md border-b border-gray-200">
          <div className="mx-auto max-w-2xl px-4 md:px-8 py-4">
            {/* Desktop (md+) - circles with labels and connectors */}
            <div className="hidden md:flex items-center justify-between">
              {STEP_META.map((step, idx) => {
                const isComplete = currentStep > step.id
                const isActive = currentStep === step.id
                const isReachable = step.id <= currentStep
                return (
                  <div key={step.id} className="flex items-center flex-1 last:flex-none">
                    <button
                      type="button"
                      onClick={() => goToStep(step.id)}
                      className={`group flex items-center gap-3 rounded-xl px-2 py-1.5 -mx-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${
                        isReachable ? 'cursor-pointer' : 'cursor-pointer'
                      }`}
                      aria-current={isActive ? 'step' : undefined}
                      aria-label={`Go to step ${step.id}: ${step.label}`}
                    >
                      <span
                        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold transition-all duration-300 ${
                          isComplete
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                            : isActive
                              ? 'bg-white text-emerald-700 ring-2 ring-emerald-500 shadow-md shadow-emerald-500/20'
                              : 'bg-gray-200 text-gray-500 group-hover:bg-gray-300'
                        }`}
                      >
                        {isComplete ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.id
                        )}
                      </span>
                      <div className="hidden lg:block text-left">
                        <p
                          className={`text-sm font-semibold leading-tight transition-colors ${
                            isActive
                              ? 'text-emerald-700'
                              : isComplete
                                ? 'text-gray-900'
                                : 'text-gray-500 group-hover:text-gray-700'
                          }`}
                        >
                          {step.label}
                        </p>
                        <p className="text-[11px] text-gray-500 leading-tight">Step {step.id} of 3</p>
                      </div>
                    </button>
                    {idx < STEP_META.length - 1 && (
                      <div className="flex-1 mx-3 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: currentStep > step.id ? '100%' : '0%' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Mobile (<md) - compact pill + progress bar */}
            <div className="md:hidden">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Step {currentStep} of 3
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {STEP_META[currentStep - 1].label}
                </p>
              </div>
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                {STEP_META.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`transition-colors ${
                      currentStep >= step.id ? 'text-emerald-700 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {step.description}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Form content */}
        <div className="flex-1 flex items-start justify-center px-4 md:px-8 py-6 md:py-10">
          <div className="w-full max-w-2xl">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                  Create your seller account
                </h2>
                <p className="mt-1 text-gray-600">
                  Already a vendor?{' '}
                  <Link href="/login" className="text-green-600 hover:text-green-700 font-semibold">
                    Sign in here
                  </Link>
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  // Defensive: never let an implicit form submission (e.g. Enter
                  // key in an input) trigger the signup. The submit only fires
                  // from an explicit click on the Submit button on step 3.
                  e.preventDefault()
                  if (currentStep < 3) handleNext()
                }}
              >
                {error && (
                  <div
                    role="alert"
                    className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6 animate-shake"
                  >
                    <svg
                      className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm leading-relaxed text-red-800">{error}</span>
                  </div>
                )}

                {/* Step content wrapper - key triggers fade-in-up on step change */}
                <div key={currentStep} className="animate-fade-in-up">
                  {/* ──────────── Step 1: Personal Details ──────────── */}
                  {currentStep === 1 && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
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
                            className={`${inputBase} ${inputOk}`}
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
                            className={`${inputBase} ${inputOk}`}
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
                            className={`${inputBase} ${fieldErrors.telephone ? inputErr : inputOk}`}
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
                            placeholder="you@example.com"
                            className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
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
                            placeholder="Min. 8 characters"
                            className={`${inputBase} ${inputOk}`}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="passwordConfirm"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Password Confirm *
                          </label>
                          <input
                            id="passwordConfirm"
                            name="passwordConfirm"
                            type="password"
                            required
                            value={personalData.passwordConfirm}
                            onChange={handlePersonalChange}
                            placeholder="Re-enter password"
                            className={`${inputBase} ${inputOk}`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ──────────── Step 2: Seller Information ──────────── */}
                  {currentStep === 2 && (
                    <div className="space-y-8">
                      {/* Section: Store basics */}
                      <section className="space-y-5">
                        <header>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                            Store basics
                          </h3>
                          <div className="mt-2 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
                        </header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
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
                              className={`${inputBase} ${
                                fieldErrors.storeName || fieldErrors.store_name ? inputErr : inputOk
                              }`}
                            />
                            {fieldErrors.storeName && (
                              <p className="mt-1 text-sm text-red-600">{fieldErrors.storeName}</p>
                            )}
                            {fieldErrors.store_name && (
                              <p className="mt-1 text-sm text-red-600">{fieldErrors.store_name}</p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="storePhone" className="block text-sm font-medium text-gray-700 mb-1">
                              Store Phone *
                            </label>
                            <input
                              id="storePhone"
                              name="storePhone"
                              type="tel"
                              required
                              maxLength={10}
                              value={sellerData.storePhone}
                              onChange={handleSellerChange}
                              onKeyPress={(e) => {
                                if (
                                  !/[0-9]/.test(e.key) &&
                                  e.key !== 'Backspace' &&
                                  e.key !== 'Delete' &&
                                  e.key !== 'Tab'
                                ) {
                                  e.preventDefault()
                                }
                              }}
                              placeholder="10 digit phone number"
                              className={`${inputBase} ${
                                fieldErrors.storePhone || fieldErrors.store_phone ? inputErr : inputOk
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
                            <div className="flex items-center gap-2 flex-wrap">
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
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium shadow-sm cursor-pointer hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                              >
                                Choose File
                              </label>
                              <span className="text-sm text-gray-500 truncate">
                                {storeLogo ? storeLogo.name : 'No file chosen'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">JPG or PNG, square format works best</p>
                          </div>
                          <div>
                            <label htmlFor="storeBanner" className="block text-sm font-medium text-gray-700 mb-1">
                              Store Banner
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
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
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium shadow-sm cursor-pointer hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                              >
                                Choose File
                              </label>
                              <span className="text-sm text-gray-500 truncate">
                                {storeBanner ? storeBanner.name : 'No file chosen'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Wide banner image for your store page</p>
                          </div>
                        </div>
                      </section>

                      {/* Section: Address */}
                      <section className="space-y-5">
                        <header>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                            Address
                          </h3>
                          <div className="mt-2 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
                        </header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                          <div className="md:col-span-2">
                            <label
                              htmlFor="storeAddress"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              Store Address
                            </label>
                            <textarea
                              id="storeAddress"
                              name="storeAddress"
                              value={sellerData.storeAddress}
                              onChange={handleSellerChange}
                              placeholder="Street, building, landmark"
                              rows={3}
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="storeCountry"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              Store Country
                            </label>
                            <input
                              id="storeCountry"
                              name="storeCountry"
                              type="text"
                              value={sellerData.storeCountry}
                              onChange={handleSellerChange}
                              placeholder="Store Country"
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="storeRegion"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              Store Region / State
                            </label>
                            <input
                              id="storeRegion"
                              name="storeRegion"
                              type="text"
                              value={sellerData.storeRegion}
                              onChange={handleSellerChange}
                              placeholder="Store Region / State"
                              className={`${inputBase} ${inputOk}`}
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
                              className={`${inputBase} ${inputOk}`}
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
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                        </div>
                      </section>

                      {/* Section: Policies & contact */}
                      <section className="space-y-5">
                        <header>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                            Policies & contact
                          </h3>
                          <div className="mt-2 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
                        </header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                          <div className="md:col-span-2">
                            <label
                              htmlFor="shippingPolicy"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              Store Shipping Policy
                            </label>
                            <textarea
                              id="shippingPolicy"
                              name="shippingPolicy"
                              value={sellerData.shippingPolicy}
                              onChange={handleSellerChange}
                              placeholder="Describe your shipping policy"
                              rows={3}
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label
                              htmlFor="returnPolicy"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              Store Return Policy
                            </label>
                            <textarea
                              id="returnPolicy"
                              name="returnPolicy"
                              value={sellerData.returnPolicy}
                              onChange={handleSellerChange}
                              placeholder="Describe your return policy"
                              rows={3}
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="whatsappNumber"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              WhatsApp Number *
                            </label>
                            <input
                              id="whatsappNumber"
                              name="whatsappNumber"
                              type="tel"
                              required
                              maxLength={10}
                              value={sellerData.whatsappNumber}
                              onChange={handleSellerChange}
                              onKeyPress={(e) => {
                                if (
                                  !/[0-9]/.test(e.key) &&
                                  e.key !== 'Backspace' &&
                                  e.key !== 'Delete' &&
                                  e.key !== 'Tab'
                                ) {
                                  e.preventDefault()
                                }
                              }}
                              placeholder="10 digit phone number"
                              className={`${inputBase} ${fieldErrors.whatsappNumber ? inputErr : inputOk}`}
                            />
                            {fieldErrors.whatsappNumber && (
                              <p className="mt-1 text-sm text-red-600">{fieldErrors.whatsappNumber}</p>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* ──────────── Step 3: Payment Details ──────────── */}
                  {currentStep === 3 && (
                    <div className="space-y-8">
                      <section className="space-y-5">
                        <header>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                            Banking
                          </h3>
                          <div className="mt-2 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
                        </header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                          <div>
                            <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">
                              Bank Name *
                            </label>
                            <input
                              id="bankName"
                              name="bankName"
                              type="text"
                              required
                              value={paymentData.bankName}
                              onChange={handlePaymentChange}
                              placeholder="Bank Name"
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label htmlFor="accountNo" className="block text-sm font-medium text-gray-700 mb-1">
                              Account No *
                            </label>
                            <input
                              id="accountNo"
                              name="accountNo"
                              type="text"
                              required
                              inputMode="numeric"
                              value={paymentData.accountNo}
                              onChange={handlePaymentChange}
                              placeholder="9–18 digit account number"
                              className={`${inputBase} ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label htmlFor="ifscCode" className="block text-sm font-medium text-gray-700 mb-1">
                              IFSC Code *
                            </label>
                            <input
                              id="ifscCode"
                              name="ifscCode"
                              type="text"
                              required
                              value={paymentData.ifscCode}
                              onChange={handlePaymentChange}
                              placeholder="e.g. SBIN0001234"
                              maxLength={11}
                              style={{ textTransform: 'uppercase' }}
                              className={`${inputBase} uppercase ${inputOk}`}
                            />
                          </div>
                          <div>
                            <label htmlFor="cancelCheque" className="block text-sm font-medium text-gray-700 mb-1">
                              Cancel Cheque *
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                id="cancelCheque"
                                name="cancelCheque"
                                type="file"
                                accept="image/*,.pdf"
                                required
                                onChange={handleCancelChequeChange}
                                className="hidden"
                              />
                              <label
                                htmlFor="cancelCheque"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium shadow-sm cursor-pointer hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                              >
                                Choose File
                              </label>
                              <span className="text-sm text-gray-500 truncate">
                                {cancelCheque ? cancelCheque.name : 'No file chosen'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Image or PDF</p>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-5">
                        <header>
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                            Tax & legal
                          </h3>
                          <div className="mt-2 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
                        </header>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                          <div>
                            <label htmlFor="gstNo" className="block text-sm font-medium text-gray-700 mb-1">
                              GST No *
                            </label>
                            <input
                              id="gstNo"
                              name="gstNo"
                              type="text"
                              required
                              value={paymentData.gstNo}
                              onChange={handlePaymentChange}
                              placeholder="15 character GST number"
                              maxLength={15}
                              style={{ textTransform: 'uppercase' }}
                              className={`${inputBase} ${fieldErrors.gstNo ? inputErr : inputOk}`}
                            />
                            {fieldErrors.gstNo && (
                              <p className="mt-1 text-sm text-red-600">{fieldErrors.gstNo}</p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="panNo" className="block text-sm font-medium text-gray-700 mb-1">
                              PAN No *
                            </label>
                            <input
                              id="panNo"
                              name="panNo"
                              type="text"
                              required
                              value={paymentData.panNo}
                              onChange={handlePaymentChange}
                              placeholder="ABCDE1234F"
                              maxLength={10}
                              style={{ textTransform: 'uppercase' }}
                              className={`${inputBase} uppercase ${fieldErrors.panNo ? inputErr : inputOk}`}
                            />
                            {fieldErrors.panNo && (
                              <p className="mt-1 text-sm text-red-600">{fieldErrors.panNo}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label
                              htmlFor="additionalDocuments"
                              className="block text-sm font-medium text-gray-700 mb-1"
                            >
                              PAN Card *
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                id="additionalDocuments"
                                name="additionalDocuments"
                                type="file"
                                accept="image/*,.pdf"
                                required
                                onChange={handleAdditionalDocsChange}
                                className="hidden"
                              />
                              <label
                                htmlFor="additionalDocuments"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium shadow-sm cursor-pointer hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                              >
                                Choose File
                              </label>
                              <span className="text-sm text-gray-500 truncate">
                                {additionalDocuments.length > 0
                                  ? additionalDocuments[0].name
                                  : 'No file chosen'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Upload your PAN card (Image or PDF)</p>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                </div>

                {/* Navigation buttons */}
                <div className="mt-8 flex items-center justify-between gap-3">
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      onClick={handlePrevious}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium shadow-sm hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </button>
                  ) : (
                    <span />
                  )}

                  {currentStep < 3 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-lg shadow-green-600/30 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      Next
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading || !step3Armed}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-lg shadow-green-600/30 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Submitting…</span>
                        </>
                      ) : (
                        <>
                          <span>Submit application</span>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <p className="text-center text-xs text-gray-500 mt-6">
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
