"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge, Copy } from "@medusajs/ui"
import { useEffect, useState } from "react"

type GSTDetails = {
  id: number | null
  customer_id: string | null
  gst_number: string | null
  gst_status: string | null
  business_name: string | null
  bank_name: string | null
  bank_branch_number: string | null
  bank_swift_code: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  created_at: string | null
}

const CustomerGSTWidget = ({ data }: any) => {
  // Get customer ID from widget data (Medusa v2)
  const customerId = data?.customer?.id || data?.id

  const [gstDetails, setGstDetails] = useState<GSTDetails | null>(null)
  const [isExpanded, setIsExpanded] = useState(true) // Default to expanded - controls both sections

  useEffect(() => {
    if (!customerId) {
      console.warn("CustomerGSTWidget: No customer ID available")
      return
    }

    const loadGST = async () => {
      try {
        const res = await fetch(`/admin/customers/${customerId}/gst`, {
          credentials: "include",
        })

        if (!res.ok) {
          console.error("GST API error:", res.status, res.statusText)
          throw new Error(`Failed to fetch: ${res.status}`)
        }

        const data = await res.json()
        console.log("GST API response:", data)

        // If no row exists → create empty row like your HTML version
        setGstDetails(
          data?.gst_details || {
            id: null,
            customer_id: customerId,
            gst_number: null,
            gst_status: null,
            business_name: null,
            bank_name: null,
            bank_branch_number: null,
            bank_swift_code: null,
            bank_account_name: null,
            bank_account_number: null,
            created_at: null,
          }
        )
      } catch (err) {
        console.error("Error loading GST details:", err)
        // Set empty structure on error
        setGstDetails({
          id: null,
          customer_id: customerId,
          gst_number: null,
          gst_status: null,
          business_name: null,
          bank_name: null,
          bank_branch_number: null,
          bank_swift_code: null,
          bank_account_name: null,
          bank_account_number: null,
          created_at: null,
        })
      }
    }

    loadGST()
  }, [customerId])

  // same logic as your safe() function
  const safe = (value: any) =>
    value !== null && value !== undefined && value !== "" ? value : "null"

  if (!gstDetails) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">GST & Bank Details</Heading>
        </div>
        <div className="px-6 py-4">
          <Text>Loading...</Text>
        </div>
      </Container>
    )
  }

  const Item = ({ label, value, copy = false }: any) => (
    <div className="mb-2">
      <Text className="text-ui-fg-subtle text-xs mb-1">{label}</Text>
      <div className="flex items-center gap-2">
        <Text className="font-medium">{safe(value)}</Text>
        {copy && value && <Copy content={value} />}
      </div>
    </div>
  )

  const getStatusColor = (status: string | null) => {
    if (!status) return "grey"
    switch (status.toLowerCase()) {
      case "active":
        return "green"
      case "inactive":
        return "red"
      case "pending":
        return "orange"
      default:
        return "grey"
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4 flex items-center justify-between">
        <Heading level="h2">GST & Bank Details</Heading>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors cursor-pointer text-sm"
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      {isExpanded && (
        <div className="px-6 py-4">
          {/* GST Information Section */}
          <Heading level="h3" className="mb-3 text-sm font-medium">
            GST Information
          </Heading>

          <div className="space-y-4 mb-6">
            <Item label="GST Number" value={gstDetails.gst_number} copy />

            <div className="mb-4">
              <Text className="text-ui-fg-subtle text-xs mb-1">Status</Text>
              {gstDetails.gst_status ? (
                <Badge color={getStatusColor(gstDetails.gst_status)}>
                  {gstDetails.gst_status}
                </Badge>
              ) : (
                <Text>null</Text>
              )}
            </div>

            <Item label="Business Name" value={gstDetails.business_name} />
          </div>

          {/* Bank Details Section */}
          <div className="pt-6 border-t border-ui-border-base">
            <Heading level="h3" className="mb-3 text-sm font-medium">
              Bank Details
            </Heading>

            <Item label="Bank Name" value={gstDetails.bank_name} />
            <Item label="Branch Number" value={gstDetails.bank_branch_number} />
            <Item label="SWIFT Code" value={gstDetails.bank_swift_code} copy />
            <Item label="Account Name" value={gstDetails.bank_account_name} />
            <Item label="Account Number" value={gstDetails.bank_account_number} copy />
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerGSTWidget
