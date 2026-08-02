"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

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
  groups?: Array<{
    id?: string
    name?: string
    metadata?: Record<string, unknown> | null
  }>
}

type CustomerWidgetProps = {
  data?: CustomerWidgetData
}

type GroupingPayload = {
  source?: string | null
  account_type?: string | null
  customer_group?: string | null
  referral_code?: string | null
  company_name?: string | null
  gst_number?: string | null
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

function displayValue(value?: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || null
}

/** Align with signup: only show real 15-char GSTINs (never bank/cheque junk). */
function displayGstin(value?: string | null) {
  const trimmed = typeof value === "string" ? value.trim().toUpperCase() : ""
  return /^[0-9A-Z]{15}$/.test(trimmed) ? trimmed : null
}

const CustomerBusinessInfo = ({ data }: CustomerWidgetProps) => {
  const [grouping, setGrouping] = useState<GroupingPayload | null>(null)
  // Medusa admin widgets may pass customer as data or data.customer
  const maybeWrapped = data as unknown as
    | { customer?: CustomerWidgetData }
    | CustomerWidgetData
    | undefined
  const customer =
    maybeWrapped &&
    typeof maybeWrapped === "object" &&
    "customer" in maybeWrapped &&
    maybeWrapped.customer
      ? maybeWrapped.customer
      : (maybeWrapped as CustomerWidgetData | undefined)

  useEffect(() => {
    const customerId = customer?.id
    if (!customerId) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/admin/customers/${customerId}/grouping`, {
          credentials: "include",
        })
        if (!res.ok) return
        const payload = (await res.json()) as GroupingPayload
        if (!cancelled) setGrouping(payload)
      } catch (err) {
        console.warn("CustomerBusinessInfo: grouping fetch failed", err)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [customer?.id])

  if (!customer) {
    return null
  }

  const meta = customer.metadata || {}
  const metaType =
    typeof meta.user_type === "string"
      ? meta.user_type
      : typeof meta.customer_type === "string"
        ? meta.customer_type
        : null

  const accountTypeRaw = (
    grouping?.account_type ||
    customer.customer_type ||
    metaType ||
    "individual"
  )
    .toString()
    .toLowerCase()
  const isBusiness = accountTypeRaw === "business"
  const accountTypeLabel =
    grouping?.account_type || (isBusiness ? "Business" : "Individual")

  const referralCode =
    displayValue(grouping?.referral_code) ||
    displayValue(customer.referral_code) ||
    displayValue(
      typeof meta.referral_code === "string" ? meta.referral_code : null
    )

  const companyName =
    displayValue(grouping?.company_name) ||
    displayValue(customer.company_name) ||
    displayValue(
      typeof meta.company_name === "string" ? meta.company_name : null
    )

  const gstNumber =
    displayGstin(grouping?.gst_number) ||
    displayGstin(customer.gst_number) ||
    displayGstin(typeof meta.gst_number === "string" ? meta.gst_number : null)

  const OWEG_GROUP_NAMES = new Set([
    "Partner - Individual",
    "Partner - Business",
    "Direct - Individual",
    "Direct - Business",
  ])
  const OWEG_GROUP_KEYS = new Set([
    "partner_individual",
    "partner_business",
    "direct_individual",
    "direct_business",
  ])
  const groupFromData = (customer.groups || []).find((g) => {
    const name = typeof g?.name === "string" ? g.name : ""
    const key =
      g?.metadata && typeof g.metadata.key === "string" ? g.metadata.key : ""
    return OWEG_GROUP_NAMES.has(name) || OWEG_GROUP_KEYS.has(key)
  })?.name
  const customerGroup =
    displayValue(grouping?.customer_group) || displayValue(groupFromData)

  const source =
    displayValue(grouping?.source) ||
    (customerGroup?.startsWith("Partner")
      ? "Partner"
      : customerGroup?.startsWith("Direct")
        ? "Direct"
        : "Direct")

  const newsletterRaw =
    customer.newsletter_subscribe ??
    meta.newsletter_subscribe ??
    meta.newsletter_opt_in
  const newsletterSubscribed =
    newsletterRaw === true ||
    newsletterRaw === "true" ||
    newsletterRaw === 1

  const fullName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Customer"

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5 shadow-none">
      <div className="flex items-center justify-between gap-2 pb-4">
        <Heading level="h3" className="text-base">
          Customer Profile
        </Heading>
        <div className="flex items-center gap-2">
          <Badge size="small" className="uppercase">
            {source}
          </Badge>
          <Badge size="small" className="uppercase">
            {accountTypeLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg bg-ui-bg-subtle px-4 py-3">
          <Text weight="plus">{fullName}</Text>
          <Text size="small" className="text-ui-fg-subtle">
            {customer.email || "No email provided"}
          </Text>
        </div>

        <div className="grid gap-y-2">
          <InfoRow label="Customer ID" value={<code>{customer.id}</code>} />
          <InfoRow label="Source" value={source} />
          <InfoRow label="Account type" value={accountTypeLabel} />
          <InfoRow label="Customer group" value={customerGroup || "—"} />
          <InfoRow
            label="Phone"
            value={customer.phone || "No phone on record"}
          />
          <InfoRow label="Referral code" value={referralCode || "—"} />
          <InfoRow label="Company name" value={companyName || "—"} />
          <InfoRow label="GST number" value={gstNumber || "—"} />
          <InfoRow
            label="Newsletter"
            value={newsletterSubscribed ? "Subscribed" : "Not subscribed"}
          />
        </div>
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerBusinessInfo
