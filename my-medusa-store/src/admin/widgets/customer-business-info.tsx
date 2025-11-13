import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Heading, Text } from "@medusajs/ui"

type CustomerWidgetData = {
  id: string
  email?: string | null
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
  customer_type?: "individual" | "business" | string | null
  company_name?: string | null
  gst_number?: string | null
  referral_code?: string | null
  newsletter_subscribe?: boolean | null
  metadata?: Record<string, unknown> | null
}

type CustomerWidgetProps = {
  data?: CustomerWidgetData
}

const InfoRow = ({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) => {
  return (
    <div className="flex flex-col gap-y-0.5 border-b border-ui-border-base py-3 last:border-b-0">
      <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="small" weight="plus">
        {value ?? <span className="text-ui-fg-muted">—</span>}
      </Text>
    </div>
  )
}

const CustomerBusinessInfo = ({ data }: CustomerWidgetProps) => {
  if (!data) {
    return null
  }

  const isBusiness = data.customer_type === "business"
  const fullName =
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    data.email ||
    "Customer"

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5 shadow-none">
      <div className="flex items-center justify-between gap-2 pb-4">
        <Heading level="h3" className="text-base">
          Customer Profile
        </Heading>
        <Badge
          size="small"
          variant={isBusiness ? "green" : "neutral"}
          className="uppercase"
        >
          {isBusiness ? "Business" : "Individual"}
        </Badge>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg bg-ui-bg-subtle px-4 py-3">
          <Text weight="plus">{fullName}</Text>
          <Text size="small" className="text-ui-fg-subtle">
            {data.email || "No email provided"}
          </Text>
        </div>

        <div className="grid gap-y-2">
          <InfoRow label="Customer ID" value={<code>{data.id}</code>} />
          <InfoRow label="Phone" value={data.phone || "No phone on record"} />
          <InfoRow
            label="Referral Code"
            value={data.referral_code || "Not provided"}
          />
          <InfoRow
            label="Newsletter"
            value={data.newsletter_subscribe ? "Subscribed" : "Not subscribed"}
          />
          {isBusiness && (
            <>
              <InfoRow
                label="Company Name"
                value={data.company_name || "Not provided"}
              />
              <InfoRow
                label="GST Number"
                value={data.gst_number || "Not provided"}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerBusinessInfo






