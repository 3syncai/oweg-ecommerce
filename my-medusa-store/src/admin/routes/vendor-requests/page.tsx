import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge, toast } from "@medusajs/ui"

type Vendor = {
  id: string
  name: string
  email: string
  phone?: string | null
  pan_gst?: string | null
  store_name?: string | null
  store_logo?: string | null
  documents?: Array<{ url: string; name?: string; type?: string }>
}

const VendorRequestsPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadVendors = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/admin/vendors/pending", { 
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

  const approveVendor = async (id: string) => {
    setActionLoading(id)
    setError("")
    try {
      const res = await fetch(`/admin/vendors/${id}/approve`, { 
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

  const rejectVendor = async (id: string) => {
    setActionLoading(id)
    setError("")
    try {
      const res = await fetch(`/admin/vendors/${id}/reject`, { 
        method: "POST", 
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      if (!res.ok) {
        throw new Error(`Reject failed: ${res.status}`)
      }
      
      toast.success("Success", {
        description: "Vendor rejected"
      })
      
      await loadVendors()
    } catch (e: any) {
      const errorMsg = e?.message || "Failed to reject vendor"
      setError(errorMsg)
      toast.error("Error", {
        description: errorMsg
      })
    } finally {
      setActionLoading(null)
    }
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
                        <div className="flex items-center gap-2 text-ui-fg-subtle">
                          <span>📎</span>
                          <Text className="text-sm">
                            {vendor.documents.length} document(s) attached
                          </Text>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button 
                      variant="secondary"
                      size="base"
                      onClick={() => rejectVendor(vendor.id)}
                      disabled={actionLoading === vendor.id}
                    >
                      {actionLoading === vendor.id ? "Processing..." : "Reject"}
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
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Requests",
})

export default VendorRequestsPage