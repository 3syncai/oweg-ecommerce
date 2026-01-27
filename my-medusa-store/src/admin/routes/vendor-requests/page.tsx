import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState, useRef } from "react"
import { Container, Heading, Text, Button, Badge, toast } from "@medusajs/ui"

type VendorDocument = {
  key: string
  url: string
  name?: string
  type?: string
}

type Vendor = {
  id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  email: string
  phone?: string | null
  telephone?: string | null
  pan_gst?: string | null
  gst_no?: string | null
  pan_no?: string | null
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
  bank_name?: string | null
  account_no?: string | null
  ifsc_code?: string | null
  cancel_cheque_url?: string | null
  documents?: VendorDocument[] | null
  marketplace_seller_id?: string | null
}

const VendorRequestsPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [reviewVendor, setReviewVendor] = useState<Vendor | null>(null)
  const [rejectVendor, setRejectVendor] = useState<Vendor | null>(null)
  const [rejectionNotice, setRejectionNotice] = useState<string>("")
  const [rejecting, setRejecting] = useState(false)
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

  const loadVendors = async () => {
    setLoading(true)
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/pending`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch vendors: ${res.status}`)
      }

      const data = await res.json()
      setVendors(data?.vendors || [])
    } catch (e: any) {
      const errorMsg = e?.message || "Failed to load vendors"
      setError(errorMsg)
      toast.error("Error", {
        description: errorMsg
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVendors()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const dropdownElement = dropdownRefs.current[openDropdown]
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setOpenDropdown(null)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [openDropdown])

  const approveVendor = async (id: string) => {
    setActionLoading(id)
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      })

      if (!res.ok) {
        throw new Error(`Approve failed: ${res.status}`)
      }

      toast.success("Success", {
        description: "Vendor approved successfully"
      })

      await loadVendors()
    } catch (e: any) {
      const errorMsg = e?.message || "Failed to approve vendor"
      setError(errorMsg)
      toast.error("Error", {
        description: errorMsg
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectVendor = async (id: string, reason: string) => {
    setRejecting(true)
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rejection_reason: reason }),
      })

      if (!res.ok) {
        throw new Error(`Reject failed: ${res.status}`)
      }

      toast.success("Success", {
        description: "Vendor rejected successfully"
      })

      setRejectVendor(null)
      setRejectionNotice("")
      await loadVendors()
    } catch (e: any) {
      const errorMsg = e?.message || "Failed to reject vendor"
      setError(errorMsg)
      toast.error("Error", {
        description: errorMsg
      })
    } finally {
      setRejecting(false)
    }
  }

  const getMissingFields = (vendor: Vendor): string[] => {
    const missing: string[] = []
    if (!vendor.first_name) missing.push("First Name")
    if (!vendor.last_name) missing.push("Last Name")
    if (!vendor.phone) missing.push("Phone")
    if (!vendor.store_name) missing.push("Store Name")
    if (!vendor.store_address) missing.push("Store Address")
    if (!vendor.store_city) missing.push("Store City")
    if (!vendor.store_country) missing.push("Store Country")
    if (!vendor.store_pincode) missing.push("Store Pincode")
    if (!vendor.gst_no && !vendor.pan_gst) missing.push("GST Number")
    if (!vendor.pan_no && !vendor.pan_gst) missing.push("PAN Number")
    if (!vendor.bank_name) missing.push("Bank Name")
    if (!vendor.account_no) missing.push("Account Number")
    if (!vendor.ifsc_code) missing.push("IFSC Code")
    if (!vendor.cancel_cheque_url) missing.push("Cancel Cheque")
    if (!vendor.documents || vendor.documents.length === 0) missing.push("Documents")
    return missing
  }

  const handleSuggestionClick = (field: string) => {
    const suggestion = `Please provide ${field.toLowerCase()}.`
    setRejectionNotice((prev) => {
      if (prev.trim()) {
        return prev + "\n\n" + suggestion
      }
      return suggestion
    })
  }

  const isFieldFilled = (value: any): boolean => {
    return value !== null && value !== undefined && value !== "" && String(value).trim() !== ""
  }

  const getFilenameFromPath = (path: string): string => {
    if (!path) return `Document`
    // Extract filename from path (e.g., "vendordocuments/mystore/imgs/file.png" -> "file.png")
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }

  const renderField = (label: string, value: any) => {
    const filled = isFieldFilled(value)
    return (
      <div className="flex items-start gap-2 py-2 border-b border-ui-border-base">
        <div className="flex-1">
          <div className="text-xs font-medium text-ui-fg-muted mb-1">{label}</div>
          <div className={`text-sm ${filled ? "text-ui-fg-base" : "text-ui-fg-subtle italic"}`}>
            {filled ? String(value) : "Not provided"}
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${filled
            ? "bg-green-100 text-green-800"
            : "bg-orange-100 text-orange-800"
          }`}>
          {filled ? "✓ Filled" : "✗ Missing"}
        </div>
      </div>
    )
  }

  return (
    <Container className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Heading level="h1" className="text-3xl font-semibold mb-2">
            Vendor Requests
          </Heading>
          <Text className="text-ui-fg-subtle">
            Review and approve pending vendor registrations
          </Text>
        </div>
        <Button
          variant="secondary"
          onClick={loadVendors}
          disabled={loading}
          size="base"
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          <Text className="text-sm font-medium">{error}</Text>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Text className="text-ui-fg-subtle">Loading vendor requests...</Text>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Empty State */}
          {vendors.length === 0 ? (
            <div className="bg-ui-bg-subtle border border-ui-border-base rounded-xl p-12 text-center">
              <div className="text-6xl mb-4">📦</div>
              <Heading level="h3" className="text-lg mb-2">
                No pending vendor requests
              </Heading>
              <Text className="text-ui-fg-subtle">
                All vendor requests have been processed
              </Text>
            </div>
          ) : (
            /* Vendor Cards */
            vendors.map((vendor) => (
              <div
                key={vendor.id}
                className="bg-ui-bg-base border border-ui-border-base rounded-xl p-6 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-6">
                  {/* Logo */}
                  <div className="flex-shrink-0">
                    {vendor.store_logo ? (
                      <img
                        src={vendor.store_logo}
                        alt={vendor.store_name || vendor.name}
                        className="w-20 h-20 rounded-lg object-cover border-2 border-ui-border-base"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-ui-bg-subtle border-2 border-ui-border-base flex items-center justify-center">
                        <span className="text-3xl">🏪</span>
                      </div>
                    )}
                  </div>

                  {/* Vendor Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <Heading level="h2" className="text-xl font-semibold">
                        {vendor.store_name || vendor.name}
                      </Heading>
                      <Badge size="small" color="orange">
                        Pending Approval
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {/* Email */}
                      <div className="flex items-center gap-2 text-ui-fg-subtle">
                        <span>📧</span>
                        <Text className="text-sm">{vendor.email}</Text>
                      </div>

                      {/* Phone */}
                      {vendor.phone && (
                        <div className="flex items-center gap-2 text-ui-fg-subtle">
                          <span>📞</span>
                          <Text className="text-sm">{vendor.phone}</Text>
                        </div>
                      )}

                      {/* PAN/GST */}
                      {vendor.pan_gst && (
                        <div className="flex items-center gap-2 text-ui-fg-subtle">
                          <span>📄</span>
                          <Text className="text-sm">
                            <span className="font-medium">PAN/GST:</span> {vendor.pan_gst}
                          </Text>
                        </div>
                      )}

                      {/* Documents */}
                      {vendor.documents && vendor.documents.length > 0 && (
                        <div
                          className="relative flex items-center gap-2 text-ui-fg-subtle"
                          ref={(el) => (dropdownRefs.current[vendor.id] = el)}
                        >
                          <button
                            onClick={() => setOpenDropdown(openDropdown === vendor.id ? null : vendor.id)}
                            className="flex items-center gap-2 hover:text-ui-fg-interactive cursor-pointer"
                          >
                            <span>📎</span>
                            <Text className="text-sm">
                              {vendor.documents.length} document(s) attached
                            </Text>
                            <span className="text-xs">{openDropdown === vendor.id ? "▲" : "▼"}</span>
                          </button>
                          {openDropdown === vendor.id && (
                            <div className="absolute top-full left-0 mt-2 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg z-50 min-w-[250px]">
                              <div className="py-2">
                                {vendor.documents.map((doc, index) => {
                                  const fileName = getFilenameFromPath(doc.key || `Document ${index + 1}`)
                                  return (
                                    <button
                                      key={doc.key || index}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        window.open(doc.url, "_blank", "noopener,noreferrer")
                                        setOpenDropdown(null)
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm hover:bg-ui-bg-subtle flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      <span>📄</span>
                                      <span className="truncate font-medium">{fileName}</span>
                                      {doc.type && (
                                        <span className="text-xs text-ui-fg-subtle">({doc.type})</span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="base"
                      onClick={() => setReviewVendor(vendor)}
                      disabled={actionLoading === vendor.id}
                    >
                      Review
                    </Button>
                    <Button
                      variant="secondary"
                      size="base"
                      onClick={() => {
                        setRejectVendor(vendor)
                        setRejectionNotice("")
                      }}
                      disabled={actionLoading === vendor.id}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="base"
                      onClick={() => approveVendor(vendor.id)}
                      disabled={actionLoading === vendor.id}
                    >
                      {actionLoading === vendor.id ? "Approving..." : "Approve"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Review Modal */}
      {reviewVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setReviewVendor(null)}
        >
          <div
            className="bg-ui-bg-base rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-ui-bg-base border-b border-ui-border-base px-6 py-4 flex items-center justify-between">
              <div>
                <Heading level="h2" className="text-xl font-semibold">
                  Vendor Review - {reviewVendor.store_name || reviewVendor.name}
                </Heading>
                <Text className="text-sm text-ui-fg-subtle mt-1">Complete vendor information review</Text>
              </div>
              <button
                onClick={() => setReviewVendor(null)}
                className="text-ui-fg-subtle hover:text-ui-fg-base text-2xl font-light"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Personal Information */}
              <div>
                <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Personal Information
                </Heading>
                <div className="space-y-1">
                  {renderField("Full Name", reviewVendor.name)}
                  {renderField("First Name", reviewVendor.first_name)}
                  {renderField("Last Name", reviewVendor.last_name)}
                  {renderField("Email", reviewVendor.email)}
                  {renderField("Phone", reviewVendor.phone)}
                  {renderField("Telephone", reviewVendor.telephone)}
                </div>
              </div>

              {/* Store Information */}
              <div>
                <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Store Information
                </Heading>
                <div className="space-y-1">
                  {renderField("Store Name", reviewVendor.store_name)}
                  {renderField("Store Phone", reviewVendor.store_phone)}
                  {renderField("Store Address", reviewVendor.store_address)}
                  {renderField("Store Country", reviewVendor.store_country)}
                  {renderField("Store Region", reviewVendor.store_region)}
                  {renderField("Store City", reviewVendor.store_city)}
                  {renderField("Store Pincode", reviewVendor.store_pincode)}
                  {renderField("WhatsApp Number", reviewVendor.whatsapp_number)}
                  {reviewVendor.store_logo && (
                    <div className="py-2 border-b border-ui-border-base">
                      <Text className="text-xs font-medium text-ui-fg-muted mb-2">Store Logo</Text>
                      <img src={reviewVendor.store_logo} alt="Store Logo" className="w-24 h-24 object-cover rounded mt-2" />
                      <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 inline-block">
                        ✓ Filled
                      </div>
                    </div>
                  )}
                  {reviewVendor.store_banner && (
                    <div className="py-2 border-b border-ui-border-base">
                      <Text className="text-xs font-medium text-ui-fg-muted mb-2">Store Banner</Text>
                      <img src={reviewVendor.store_banner} alt="Store Banner" className="w-full h-32 object-cover rounded mt-2" />
                      <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 inline-block">
                        ✓ Filled
                      </div>
                    </div>
                  )}
                  {renderField("Shipping Policy", reviewVendor.shipping_policy)}
                  {renderField("Return Policy", reviewVendor.return_policy)}
                </div>
              </div>

              {/* Tax & Legal Information */}
              <div>
                <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Tax & Legal Information
                </Heading>
                <div className="space-y-1">
                  {renderField("PAN/GST (Legacy)", reviewVendor.pan_gst)}
                  {renderField("GST Number", reviewVendor.gst_no)}
                  {renderField("PAN Number", reviewVendor.pan_no)}
                </div>
              </div>

              {/* Banking Information */}
              <div>
                <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Banking Information
                </Heading>
                <div className="space-y-1">
                  {renderField("Bank Name", reviewVendor.bank_name)}
                  {renderField("Account Number", reviewVendor.account_no)}
                  {renderField("IFSC Code", reviewVendor.ifsc_code)}
                  {reviewVendor.cancel_cheque_url && (
                    <div className="py-2 border-b border-ui-border-base">
                      <Text className="text-xs font-medium text-ui-fg-muted mb-2">Cancel Cheque</Text>
                      <a
                        href={reviewVendor.cancel_cheque_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ui-fg-interactive hover:underline text-sm"
                      >
                        View Cancel Cheque
                      </a>
                      <div className="mt-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 inline-block ml-2">
                        ✓ Filled
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Documents */}
              {reviewVendor.documents && reviewVendor.documents.length > 0 && (
                <div>
                  <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                    Documents ({reviewVendor.documents.length})
                  </Heading>
                  <div className="space-y-2">
                    {reviewVendor.documents.map((doc, index) => {
                      const fileName = getFilenameFromPath(doc.key || `Document ${index + 1}`)
                      return (
                        <div key={doc.key || index} className="flex items-center justify-between py-2 border-b border-ui-border-base">
                          <div className="flex-1">
                            <Text className="text-sm font-medium text-ui-fg-base">{fileName}</Text>
                            {doc.type && (
                              <Text className="text-xs text-ui-fg-subtle mt-1">
                                Type: {doc.type}
                              </Text>
                            )}
                          </div>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
                          >
                            View
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Other Information */}
              <div>
                <Heading level="h3" className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Other Information
                </Heading>
                <div className="space-y-1">
                  {renderField("Marketplace Seller ID", reviewVendor.marketplace_seller_id)}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-ui-bg-base border-t border-ui-border-base px-6 py-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setReviewVendor(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  approveVendor(reviewVendor.id)
                  setReviewVendor(null)
                }}
                disabled={actionLoading === reviewVendor.id}
              >
                {actionLoading === reviewVendor.id ? "Approving..." : "Approve Vendor"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setRejectVendor(null)}
        >
          <div
            className="bg-ui-bg-base rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-ui-bg-base border-b border-ui-border-base px-6 py-4 flex items-center justify-between">
              <div>
                <Heading level="h2" className="text-xl font-semibold">
                  Reject Vendor - {rejectVendor.store_name || rejectVendor.name}
                </Heading>
                <Text className="text-sm text-ui-fg-subtle mt-1">Provide a reason for rejection</Text>
              </div>
              <button
                onClick={() => setRejectVendor(null)}
                className="text-ui-fg-subtle hover:text-ui-fg-base text-2xl font-light"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Missing Fields Suggestions */}
              {(() => {
                const missingFields = getMissingFields(rejectVendor)
                if (missingFields.length > 0) {
                  return (
                    <div>
                      <Heading level="h3" className="text-sm font-semibold mb-2 text-ui-fg-base">
                        Missing Information
                      </Heading>
                      <Text className="text-xs text-ui-fg-subtle mb-3">
                        Click on any missing field to add it to the notice:
                      </Text>
                      <div className="flex flex-wrap gap-2">
                        {missingFields.map((field) => (
                          <Button
                            key={field}
                            variant="secondary"
                            size="small"
                            onClick={() => handleSuggestionClick(field)}
                            className="bg-orange-100 text-orange-800 hover:bg-orange-200"
                          >
                            {field} ✗
                          </Button>
                        ))}
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              {/* Rejection Notice Form */}
              <div>
                <label className="block text-sm font-medium text-ui-fg-base mb-2">
                  Rejection Notice <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionNotice}
                  onChange={(e) => setRejectionNotice(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  className="w-full px-3 py-2 border border-ui-border-base rounded-md bg-ui-bg-base text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive focus:border-transparent min-h-[150px]"
                  required
                />
                <Text className="text-xs text-ui-fg-subtle mt-1">
                  This notice will be sent to the vendor explaining why their request was rejected.
                </Text>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-ui-bg-base border-t border-ui-border-base px-6 py-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectVendor(null)
                  setRejectionNotice("")
                }}
                disabled={rejecting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!rejectionNotice.trim()) {
                    toast.error("Error", {
                      description: "Rejection notice is required"
                    })
                    return
                  }
                  handleRejectVendor(rejectVendor.id, rejectionNotice)
                }}
                disabled={rejecting || !rejectionNotice.trim()}
              >
                {rejecting ? "Rejecting..." : "Send Rejection Notice"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Requests",
})

export default VendorRequestsPage