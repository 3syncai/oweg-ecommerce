import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState, useRef } from "react"

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
  documents?: VendorDocument[] | null
  marketplace_seller_id?: string | null
}

const VendorRequestsWidget = () => {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [reviewVendor, setReviewVendor] = useState<Vendor | null>(null)
  const [rejectVendor, setRejectVendor] = useState<Vendor | null>(null)
  const [rejectionNotice, setRejectionNotice] = useState<string>("")
  const [rejecting, setRejecting] = useState(false)
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/pending`, { credentials: "include" })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setVendors(data?.vendors || [])
    } catch (e: any) {
      setError(e?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const approve = async (id: string) => {
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/${id}/approve`, { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
      await load()
    } catch (e: any) {
      setError(e?.message || "Approve failed")
    }
  }

  const reject = async (id: string, reason: string) => {
    setRejecting(true)
    setError("")
    try {
      const backendUrl = (process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const res = await fetch(`${backendUrl}/admin/vendors/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rejection_reason: reason }),
      })
      if (!res.ok) throw new Error(`Reject failed: ${res.status}`)
      setRejectVendor(null)
      setRejectionNotice("")
      await load()
    } catch (e: any) {
      setError(e?.message || "Reject failed")
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

  const toggleDropdown = (vendorId: string) => {
    setOpenDropdown(openDropdown === vendorId ? null : vendorId)
  }

  const handleDocumentClick = (url: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(url, "_blank", "noopener,noreferrer")
    setOpenDropdown(null)
  }

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
    <div className="rounded-lg bg-ui-bg-subtle p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="inter-base-semibold">Vendor Requests</div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      {error ? <div className="text-red-600 inter-small-regular mb-2">{error}</div> : null}
      {loading ? <div className="inter-small-regular">Loading...</div> : (
        vendors.length === 0 ? (
          <div className="inter-small-regular text-ui-fg-subtle">No pending vendors.</div>
        ) : (
          <div className="space-y-2">
            {vendors.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <div className="flex-1 inter-small-regular">
                  <div className="inter-small-semibold">{v.store_name || v.name}</div>
                  <div className="text-ui-fg-subtle">
                    {v.email}{v.phone ? ` · ${v.phone}` : ""}
                  </div>
                  {v.documents && v.documents.length > 0 && (
                    <div className="relative mt-1" ref={(el) => (dropdownRefs.current[v.id] = el)}>
                      <button
                        onClick={() => toggleDropdown(v.id)}
                        className="flex items-center gap-1 text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-xs cursor-pointer"
                      >
                        <span>📎</span>
                        <span>{v.documents.length} document(s) attached</span>
                        <span className="text-xs">{openDropdown === v.id ? "▲" : "▼"}</span>
                      </button>
                      {openDropdown === v.id && (
                        <div className="absolute top-full left-0 mt-1 bg-ui-bg-base border border-ui-border-base rounded-md shadow-lg z-50 min-w-[200px]">
                          <div className="py-1">
                            {v.documents.map((doc, index) => {
                              const fileName = getFilenameFromPath(doc.key || `Document ${index + 1}`)
                              return (
                                <button
                                  key={doc.key || index}
                                  onClick={(e) => handleDocumentClick(doc.url, e)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-ui-bg-subtle flex items-center gap-2 cursor-pointer"
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
                <div className="flex gap-1">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setReviewVendor(v)}
                  >
                    Review
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      setRejectVendor(v)
                      setRejectionNotice("")
                    }}
                  >
                    Reject
                  </button>
                  <button className="btn btn-primary btn-small" onClick={() => approve(v.id)}>Approve</button>
                </div>
              </div>
            ))}
            {/* Link to the full admin page we created */}
            <a href="/app/vendor-requests" className="text-ui-fg-interactive inter-small-regular">Open Vendor Requests</a>
          </div>
        )
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
                <h2 className="text-xl font-semibold">Vendor Review - {reviewVendor.store_name || reviewVendor.name}</h2>
                <p className="text-sm text-ui-fg-subtle mt-1">Complete vendor information review</p>
              </div>
              <button
                onClick={() => setReviewVendor(null)}
                className="text-ui-fg-subtle hover:text-ui-fg-base text-2xl"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Personal Information
                </h3>
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
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Store Information
                </h3>
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
                      <div className="text-xs font-medium text-ui-fg-muted mb-2">Store Logo</div>
                      <img src={reviewVendor.store_logo} alt="Store Logo" className="w-24 h-24 object-cover rounded" />
                      <div className="mt-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 inline-block">
                        ✓ Filled
                      </div>
                    </div>
                  )}
                  {reviewVendor.store_banner && (
                    <div className="py-2 border-b border-ui-border-base">
                      <div className="text-xs font-medium text-ui-fg-muted mb-2">Store Banner</div>
                      <img src={reviewVendor.store_banner} alt="Store Banner" className="w-full h-32 object-cover rounded" />
                      <div className="mt-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 inline-block">
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
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Tax & Legal Information
                </h3>
                <div className="space-y-1">
                  {renderField("PAN/GST (Legacy)", reviewVendor.pan_gst)}
                  {renderField("GST Number", reviewVendor.gst_no)}
                  {renderField("PAN Number", reviewVendor.pan_no)}
                </div>
              </div>

              {/* Banking Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Banking Information
                </h3>
                <div className="space-y-1">
                  {renderField("Bank Name", reviewVendor.bank_name)}
                  {renderField("Account Number", reviewVendor.account_no)}
                  {renderField("IFSC Code", reviewVendor.ifsc_code)}
                  {reviewVendor.cancel_cheque_url && (
                    <div className="py-2 border-b border-ui-border-base">
                      <div className="text-xs font-medium text-ui-fg-muted mb-2">Cancel Cheque</div>
                      <a
                        href={reviewVendor.cancel_cheque_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ui-fg-interactive hover:underline"
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
                  <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                    Documents ({reviewVendor.documents.length})
                  </h3>
                  <div className="space-y-2">
                    {reviewVendor.documents.map((doc, index) => {
                      const fileName = getFilenameFromPath(doc.key || `Document ${index + 1}`)
                      return (
                        <div key={doc.key || index} className="flex items-center justify-between py-2 border-b border-ui-border-base">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-ui-fg-base">{fileName}</div>
                            {doc.type && (
                              <div className="text-xs text-ui-fg-subtle mt-1">
                                Type: {doc.type}
                              </div>
                            )}
                          </div>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-small"
                          >
                            View
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Other Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4 pb-2 border-b border-ui-border-base">
                  Other Information
                </h3>
                <div className="space-y-1">
                  {renderField("Marketplace Seller ID", reviewVendor.marketplace_seller_id)}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-ui-bg-base border-t border-ui-border-base px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setReviewVendor(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
              <button
                onClick={() => {
                  approve(reviewVendor.id)
                  setReviewVendor(null)
                }}
                className="btn btn-primary"
              >
                Approve Vendor
              </button>
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
                <h2 className="text-xl font-semibold">Reject Vendor - {rejectVendor.store_name || rejectVendor.name}</h2>
                <p className="text-sm text-ui-fg-subtle mt-1">Provide a reason for rejection</p>
              </div>
              <button
                onClick={() => setRejectVendor(null)}
                className="text-ui-fg-subtle hover:text-ui-fg-base text-2xl"
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
                      <h3 className="text-sm font-semibold mb-2 text-ui-fg-base">Missing Information</h3>
                      <p className="text-xs text-ui-fg-subtle mb-3">Click on any missing field to add it to the notice:</p>
                      <div className="flex flex-wrap gap-2">
                        {missingFields.map((field) => (
                          <button
                            key={field}
                            onClick={() => handleSuggestionClick(field)}
                            className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded-md hover:bg-orange-200 transition-colors cursor-pointer"
                          >
                            {field} ✗
                          </button>
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
                <p className="text-xs text-ui-fg-subtle mt-1">
                  This notice will be sent to the vendor explaining why their request was rejected.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-ui-bg-base border-t border-ui-border-base px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectVendor(null)
                  setRejectionNotice("")
                }}
                className="btn btn-secondary"
                disabled={rejecting}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!rejectionNotice.trim()) {
                    setError("Rejection notice is required")
                    return
                  }
                  reject(rejectVendor.id, rejectionNotice)
                }}
                className="btn btn-danger"
                disabled={rejecting || !rejectionNotice.trim()}
              >
                {rejecting ? "Rejecting..." : "Send Rejection Notice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default VendorRequestsWidget


