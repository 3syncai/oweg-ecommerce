"use client"

import React, { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { User, FileText, Briefcase, CreditCard, MapPin, Lock, ChevronRight, Check, Upload, AlertCircle } from "lucide-react"

type FormDataType = {
  refer_code: string
  entry_sponsor: string
  is_agent: boolean
  first_name: string
  last_name: string
  email: string
  phone: string
  gender: string
  father_name: string
  mother_name: string
  birth_date: string
  qualification: string
  marital_status: string
  blood_group: string
  emergency_person_name: string
  emergency_person_mobile: string
  aadhar_card_no: string
  pan_card_no: string
  designation: string
  sales_target: string
  branch: string
  area: string
  state: string
  payment_method: string
  bank_name: string
  bank_branch: string
  ifsc_code: string
  account_name: string
  account_number: string
  address_1: string
  address_2: string
  city: string
  pin_code: string
  country: string
  address_state: string
  password: string
  confirm_password: string
  agree_to_policy: boolean
}

export default function RegisterPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [formData, setFormData] = useState<FormDataType>({
    refer_code: "",
    entry_sponsor: "",
    is_agent: false,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gender: "",
    father_name: "",
    mother_name: "",
    birth_date: "",
    qualification: "",
    marital_status: "",
    blood_group: "",
    emergency_person_name: "",
    emergency_person_mobile: "",
    aadhar_card_no: "",
    pan_card_no: "",
    designation: "",
    sales_target: "",
    branch: "",
    area: "",
    state: "",
    payment_method: "Bank Transfer",
    bank_name: "",
    bank_branch: "",
    ifsc_code: "",
    account_name: "",
    account_number: "",
    address_1: "",
    address_2: "",
    city: "",
    pin_code: "",
    country: "",
    address_state: "",
    password: "",
    confirm_password: "",
    agree_to_policy: false,
  })

  const [files, setFiles] = useState<{
    aadhar_card_photo?: File | null
    pan_card_photo?: File | null
  }>({})

  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)
  const [successMessage, setSuccessMessage] = useState<string>("")

  const steps = [
    { id: 1, name: "Personal", icon: User },
    { id: 2, name: "Details", icon: FileText },
    { id: 3, name: "Work", icon: Briefcase },
    { id: 4, name: "Payment", icon: CreditCard },
    { id: 5, name: "Finalize", icon: Lock },
  ]

  const handleFileChange = (field: "aadhar_card_photo" | "pan_card_photo", file: File | null) => {
    setFiles((prev) => ({ ...prev, [field]: file }))
  }

  const validateStep = (step: number) => {
    // basic per-step validation; can be expanded
    if (step === 1) {
      if (!formData.first_name || !formData.last_name || !formData.email || !formData.phone) {
        setError("First name, last name, email, and mobile are required")
        return false
      }
    }
    if (step === 2) {
      if (!formData.gender || !formData.birth_date || !formData.father_name || !formData.mother_name) {
        setError("Please fill required personal details")
        return false
      }
      if (!formData.aadhar_card_no || !formData.pan_card_no) {
        setError("Aadhar and PAN number are required")
        return false
      }
    }
    if (step === 3) {
      if (!formData.designation) {
        setError("Please select your designation")
        return false
      }
    }
    if (step === 4) {
      if (formData.payment_method === "Bank Transfer") {
        if (!formData.bank_name || !formData.ifsc_code || !formData.account_number || !formData.account_name) {
          setError("Please fill bank details for Bank Transfer")
          return false
        }
      }
    }

    setError("")
    return true
  }

  const nextStep = () => {
    if (validateStep(currentStep)) setCurrentStep((s) => Math.min(5, s + 1))
  }

  const prevStep = () => setCurrentStep((s) => Math.max(1, s - 1))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    // final validations
    if (!formData.password || !formData.confirm_password) {
      setError("Password and confirm password are required")
      return
    }
    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match")
      return
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long")
      return
    }

    if (!formData.agree_to_policy) {
      setError("You must agree to the Agent Policy")
      return
    }

    // allow submission even if files are missing (adjust if required)
    setLoading(true)

    try {
      const payload = new FormData()
      Object.entries(formData).forEach(([key, value]) => {
        // cast boolean to string
        if (typeof value === "boolean") payload.append(key, value ? "true" : "false")
        else payload.append(key, (value as any) ?? "")
      })

      if (files.aadhar_card_photo) payload.append("aadhar_card_photo", files.aadhar_card_photo)
      if (files.pan_card_photo) payload.append("pan_card_photo", files.pan_card_photo)

      // Example call — replace with your API endpoint
      // const res = await fetch('/api/register', { method: 'POST', body: payload })
      // const data = await res.json()

       const { apiRequest } = await import("../../lib/api-client")
       
       const response = await apiRequest("/store/affiliate/register", {
         method: "POST",
         body: payload,
       })

       const data = await response.json()

       if (response.ok) {
         // Store user data temporarily
         localStorage.setItem("affiliate_user", JSON.stringify(data.user))
         setSuccessMessage("Registration successful! Your application is pending verification.")
         setLoading(false)
         
         // Redirect to verification pending page after a short delay
         setTimeout(() => {
           router.push("/verification-pending")
         }, 2000)
       } else {
         setError(data?.message || "Registration failed")
         setLoading(false)
       }
    } catch (err: any) {
      setError(err?.message || "Failed to submit form")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Agent Registration</h1>
          <p className="text-gray-600">Join our network and start your journey with us</p>
        </div>

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
            <div className="flex justify-between items-center">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = currentStep === step.id
                const isCompleted = currentStep > step.id
                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? "bg-green-500 scale-110"
                          : isActive
                          ? "bg-white text-indigo-600 scale-110 shadow-lg"
                          : "bg-indigo-400 text-white"
                      }`}>
                        {isCompleted ? <Check className="w-6 h-6 text-white" /> : <Icon className="w-6 h-6" />}
                      </div>
                      <span className={`mt-2 text-xs font-medium ${isActive ? "text-white font-bold" : "text-indigo-200"}`}>
                        {step.name}
                      </span>
                    </div>
                    {index < steps.length - 1 && <div className={`h-1 flex-1 mx-2 transition-all duration-300 ${isCompleted ? "bg-green-500" : "bg-indigo-400"}`} />}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">Error</p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {successMessage && (
              <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg flex items-start">
                <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-800 font-medium">Success</p>
                  <p className="text-green-700 text-sm">{successMessage}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Step 1 */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-gray-200 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                      <User className="w-6 h-6 mr-2 text-indigo-600" /> Personal Information
                    </h2>
                    <p className="text-gray-600 mt-1">Tell us about yourself</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-3">Do you want to become an Agent? (₹0)</label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, is_agent: !formData.is_agent })}
                        className={`w-full py-4 rounded-xl font-medium transition-all duration-300 ${
                          formData.is_agent
                            ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg scale-105"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}>
                        {formData.is_agent ? "✓ Yes, I want to become an agent" : "Click to become an agent"}
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Refer Code</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Enter refer code"
                        value={formData.refer_code}
                        onChange={(e) => setFormData({ ...formData, refer_code: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Entry Sponsor</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Enter entry sponsor"
                        value={formData.entry_sponsor}
                        onChange={(e) => setFormData({ ...formData, entry_sponsor: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">First Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="John"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Doe"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Email <span className="text-red-500">*</span></label>
                      <input
                        type="email"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="john.doe@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {currentStep === 2 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-gray-200 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                      <FileText className="w-6 h-6 mr-2 text-indigo-600" /> Additional Details
                    </h2>
                    <p className="text-gray-600 mt-1">Complete your profile information</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Gender <span className="text-red-500">*</span></label>
                      <select
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      >
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Birth Date <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.birth_date}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Father's Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Father's Name"
                        value={formData.father_name}
                        onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Mother's Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Mother's Name"
                        value={formData.mother_name}
                        onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Qualification</label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.qualification}
                        onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                      >
                        <option value="">Select qualification</option>
                        <option value="high_school">High School</option>
                        <option value="diploma">Diploma</option>
                        <option value="bachelor">Bachelor's Degree</option>
                        <option value="master">Master's Degree</option>
                        <option value="phd">PhD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Marital Status <span className="text-red-500">*</span></label>
                      <select
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.marital_status}
                        onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                      >
                        <option value="">Select status</option>
                        <option value="single">Single</option>
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="widowed">Widowed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Blood Group</label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.blood_group}
                        onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                      >
                        <option value="">Select blood group</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Emergency contact name"
                        value={formData.emergency_person_name}
                        onChange={(e) => setFormData({ ...formData, emergency_person_name: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Mobile <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Emergency contact number"
                        value={formData.emergency_person_mobile}
                        onChange={(e) => setFormData({ ...formData, emergency_person_mobile: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Aadhar Card Number <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="XXXX XXXX XXXX"
                        value={formData.aadhar_card_no}
                        onChange={(e) => setFormData({ ...formData, aadhar_card_no: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">PAN Card Number <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="XXXXX0000X"
                        value={formData.pan_card_no}
                        onChange={(e) => setFormData({ ...formData, pan_card_no: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Aadhar Card Photo</label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={(e) => handleFileChange("aadhar_card_photo", e.target.files?.[0] || null)}
                        />
                      </div>
                      {files.aadhar_card_photo && (
                        <p className="mt-2 text-sm text-green-600 flex items-center"><Check className="w-4 h-4 mr-1" />{files.aadhar_card_photo.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">PAN Card Photo</label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={(e) => handleFileChange("pan_card_photo", e.target.files?.[0] || null)}
                        />
                      </div>
                      {files.pan_card_photo && (
                        <p className="mt-2 text-sm text-green-600 flex items-center"><Check className="w-4 h-4 mr-1" />{files.pan_card_photo.name}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {currentStep === 3 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-gray-200 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center"><Briefcase className="w-6 h-6 mr-2 text-indigo-600" /> Work Information</h2>
                    <p className="text-gray-600 mt-1">Tell us about your professional details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Designation <span className="text-red-500">*</span></label>
                      <select
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      >
                        <option value="">Select designation</option>
                        <option value="agent">Agent</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Sales Target</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Enter sales target"
                        value={formData.sales_target}
                        onChange={(e) => setFormData({ ...formData, sales_target: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      >
                        <option value="">Select branch</option>
                        <option value="north">North Branch</option>
                        <option value="south">South Branch</option>
                        <option value="east">East Branch</option>
                        <option value="west">West Branch</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Area</label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        value={formData.area}
                        onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      >
                        <option value="">Select area</option>
                        <option value="urban">Urban</option>
                        <option value="rural">Rural</option>
                        <option value="suburban">Suburban</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="State"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Address Line 1</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Address line 1"
                        value={formData.address_1}
                        onChange={(e) => setFormData({ ...formData, address_1: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="City"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Pin Code</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="Pin code"
                        value={formData.pin_code}
                        onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Payment */}
              {currentStep === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-gray-200 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center"><CreditCard className="w-6 h-6 mr-2 text-indigo-600" /> Payment Details</h2>
                    <p className="text-gray-600 mt-1">Choose how you'd like to receive payments / setup payout</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                      <div className="flex gap-3">
                        {['Bank Transfer', 'UPI', 'Net Banking'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setFormData({ ...formData, payment_method: m })}
                            className={`px-4 py-2 rounded-lg border ${formData.payment_method === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {formData.payment_method === 'Bank Transfer' && (
                      <>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
                          <input value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Account Name</label>
                          <input value={formData.account_name} onChange={(e) => setFormData({ ...formData, account_name: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number</label>
                          <input value={formData.account_number} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">IFSC Code</label>
                          <input value={formData.ifsc_code} onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                        </div>
                      </>
                    )}

                    {formData.payment_method === 'UPI' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">UPI ID</label>
                        <input value={formData.account_number} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} placeholder="example@upi" className="w-full px-4 py-3 border rounded-lg" />
                      </div>
                    )}

                    {formData.payment_method === 'Net Banking' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Netbanking Reference / Bank</label>
                        <input value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 5: Finalize */}
              {currentStep === 5 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-gray-200 pb-4">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center"><Lock className="w-6 h-6 mr-2 text-indigo-600" /> Finalize</h2>
                    <p className="text-gray-600 mt-1">Set your password and confirm to finish registration</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Password <span className="text-red-500">*</span></label>
                      <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password <span className="text-red-500">*</span></label>
                      <input type="password" value={formData.confirm_password} onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })} className="w-full px-4 py-3 border rounded-lg" />
                    </div>

                    <div className="md:col-span-2 flex items-center gap-3">
                      <input id="agree" type="checkbox" checked={formData.agree_to_policy} onChange={(e) => setFormData({ ...formData, agree_to_policy: e.target.checked })} />
                      <label htmlFor="agree" className="text-sm text-gray-700">I agree to the Agent Policy</label>
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-600">Uploaded Documents</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        <li>{files.aadhar_card_photo ? files.aadhar_card_photo.name : 'Aadhar not uploaded'}</li>
                        <li>{files.pan_card_photo ? files.pan_card_photo.name : 'PAN not uploaded'}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="mt-8 flex items-center justify-between">
                <div>
                  {currentStep > 1 && (
                    <button type="button" onClick={prevStep} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                      Back
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {currentStep < 5 && (
                    <button type="button" onClick={nextStep} className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:shadow-lg">
                      Next <ChevronRight className="w-4 h-4 inline-block ml-2" />
                    </button>
                  )}

                  {currentStep === 5 && (
                    <button disabled={loading} type="submit" className={`px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:shadow-lg ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      {loading ? 'Submitting...' : 'Finish Registration'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
