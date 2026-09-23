"use client"

import React, { useMemo, useState } from "react"
import { Button, Heading, Input, Label, Text } from "@medusajs/ui"
import {
  COMMISSION_RATE,
  DEFAULT_LOGISTICS_FEE,
  FEE_GST_RATE,
  PARTNER_COMMISSION_RATE,
  PLATFORM_FEE_RATE,
  PRODUCT_GST_RATE,
  TCS_RATE,
  TDS_RATE,
} from "@/lib/pricingConfig"
import {
  calculateVendorPricing,
  formatInr,
  type MoneyRow,
} from "@/lib/productPriceCalculator"

function parseNonNegativeNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function allowDecimalInput(value: string): string | null {
  if (value === "") return ""
  const cleaned = value.replace(/,/g, "")
  if (!/^\d*\.?\d*$/.test(cleaned)) return null
  return cleaned
}

function TableHeader({
  col2,
  col3,
}: {
  col2: string
  col3: string
}) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem] gap-2 pb-2 mb-1 border-b border-ui-border-base">
      <Text size="xsmall" className="text-ui-fg-muted font-medium">
        Particulars
      </Text>
      <Text
        size="xsmall"
        className="text-ui-fg-muted font-medium text-right tabular-nums"
      >
        Basic
      </Text>
      <Text
        size="xsmall"
        className="text-ui-fg-muted font-medium text-right tabular-nums"
      >
        {col2}
      </Text>
      <Text
        size="xsmall"
        className="text-ui-fg-muted font-medium text-right tabular-nums"
      >
        {col3}
      </Text>
    </div>
  )
}

function MoneyTableRow({
  label,
  row,
  strong,
  muted,
}: {
  label: string
  row: MoneyRow
  strong?: boolean
  muted?: boolean
}) {
  const textClass = strong
    ? "font-semibold text-ui-fg-base"
    : muted
      ? "text-ui-fg-muted"
      : "text-ui-fg-subtle"
  const numClass = strong
    ? "font-semibold tabular-nums text-ui-fg-base text-right"
    : "tabular-nums text-ui-fg-base text-right"

  return (
    <div
      className={`grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem] gap-2 py-1.5 ${
        strong ? "pt-3 mt-1 border-t border-ui-border-base" : ""
      }`}
    >
      <Text size="small" className={textClass}>
        {label}
      </Text>
      <Text size="small" className={numClass}>
        {formatInr(row.basic)}
      </Text>
      <Text size="small" className={numClass}>
        {formatInr(row.gstOrTax)}
      </Text>
      <Text size="small" className={numClass}>
        {formatInr(row.total)}
      </Text>
    </div>
  )
}

export default function ProductPriceCalculator() {
  const [baseInput, setBaseInput] = useState("")
  const [logisticsInput, setLogisticsInput] = useState(
    String(DEFAULT_LOGISTICS_FEE)
  )
  const [expanded, setExpanded] = useState(false)

  const pricing = useMemo(
    () =>
      calculateVendorPricing(
        parseNonNegativeNumber(baseInput),
        parseNonNegativeNumber(logisticsInput)
      ),
    [baseInput, logisticsInput]
  )

  const hasPrice = pricing.item.basic > 0

  const onBaseChange = (value: string) => {
    const next = allowDecimalInput(value)
    if (next === null) return
    setBaseInput(next)
  }

  const onLogisticsChange = (value: string) => {
    const next = allowDecimalInput(value)
    if (next === null) return
    setLogisticsInput(next)
  }

  const reset = () => {
    setBaseInput("")
    setLogisticsInput(String(DEFAULT_LOGISTICS_FEE))
    setExpanded(false)
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base overflow-hidden">
      <div className="px-5 py-4 border-b border-ui-border-base bg-ui-bg-subtle/40 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level="h3" className="text-base font-semibold">
            Product Price Calculator
          </Heading>
          <Text size="small" className="text-ui-fg-muted mt-1">
            Enter your product base price to see the estimated total listing
            price, charges and your bank settlement.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={reset} type="button">
          Reset
        </Button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="vendor-base-price" className="mb-1.5 block">
                Product Base Price
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted text-sm">
                  ₹
                </span>
                <Input
                  id="vendor-base-price"
                  inputMode="decimal"
                  placeholder="Enter your product base price"
                  value={baseInput}
                  onChange={(e) => onBaseChange(e.target.value)}
                  className="pl-7 text-base h-11"
                  aria-describedby="vendor-base-price-hint"
                />
              </div>
              <Text
                id="vendor-base-price-hint"
                size="xsmall"
                className="text-ui-fg-muted mt-1.5 block"
              >
                Price before GST. Fees and taxes are applied automatically by the
                platform.
              </Text>
            </div>

            <div>
              <Label htmlFor="vendor-logistics-fee" className="mb-1.5 block">
                Logistics Fee
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted text-sm">
                  ₹
                </span>
                <Input
                  id="vendor-logistics-fee"
                  inputMode="decimal"
                  placeholder={String(DEFAULT_LOGISTICS_FEE)}
                  value={logisticsInput}
                  onChange={(e) => onLogisticsChange(e.target.value)}
                  className="pl-7 text-base h-11"
                  aria-describedby="vendor-logistics-fee-hint"
                />
              </div>
              <Text
                id="vendor-logistics-fee-hint"
                size="xsmall"
                className="text-ui-fg-muted mt-1.5 block"
              >
                Logistics basic before GST. Default ₹{DEFAULT_LOGISTICS_FEE};
                editable for your shipment.
              </Text>
            </div>

            <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/60 px-3 py-2.5">
              <Text size="xsmall" className="text-ui-fg-muted block">
                Total Listing Price
              </Text>
              <Text
                size="base"
                weight="plus"
                className={`tabular-nums block mt-0.5 text-lg ${
                  hasPrice ? "text-ui-fg-base" : "text-ui-fg-muted"
                }`}
              >
                {formatInr(
                  hasPrice
                    ? pricing.totalListingPriceRounded
                    : 0,
                  hasPrice ? 0 : 2
                )}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted mt-1 block">
                Use this as your listing / Price ₹.
              </Text>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 sm:p-5 ${
              hasPrice
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-ui-border-base bg-ui-bg-subtle/50"
            }`}
          >
            <Text size="small" className="text-ui-fg-muted font-medium">
              Bank Settlement
            </Text>
            <p
              className={`mt-1 text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight ${
                hasPrice ? "text-emerald-800" : "text-ui-fg-muted"
              }`}
            >
              {formatInr(
                hasPrice ? pricing.bankSettlementRounded : 0,
                hasPrice ? 0 : 2
              )}
            </p>
            <Text size="xsmall" className="text-ui-fg-muted mt-1 block">
              Estimated amount after marketplace charges (listing − deductions)
            </Text>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/80 border border-ui-border-base/60 px-3 py-2">
                <Text size="xsmall" className="text-ui-fg-muted block">
                  Total Listing Price
                </Text>
                <Text
                  size="small"
                  weight="plus"
                  className="tabular-nums text-ui-fg-base"
                >
                  {formatInr(
                    hasPrice ? pricing.totalListingPriceRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </Text>
              </div>
              <div className="rounded-lg bg-white/80 border border-ui-border-base/60 px-3 py-2">
                <Text size="xsmall" className="text-ui-fg-muted block">
                  Total Deductions
                </Text>
                <Text
                  size="small"
                  weight="plus"
                  className="tabular-nums text-ui-fg-base"
                >
                  {formatInr(
                    hasPrice ? pricing.totalDeductionsRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </Text>
              </div>
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            className="text-sm font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide detailed breakdown" : "View detailed breakdown"}
          </button>
        </div>

        {expanded ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-ui-border-base p-4 overflow-x-auto">
              <Text weight="plus" size="small" className="mb-3 block">
                Listing Price
              </Text>
              <TableHeader col2="Output GST" col3="Total" />
              <MoneyTableRow
                label={`Item price (GST ${PRODUCT_GST_RATE}%)`}
                row={pricing.item}
              />
              <MoneyTableRow
                label={`Logistics (GST ${PRODUCT_GST_RATE}%)`}
                row={pricing.logistics}
                muted
              />
              <MoneyTableRow
                label="Total Listing Price"
                row={pricing.listing}
                strong
              />
            </div>

            <div className="rounded-lg border border-ui-border-base p-4 overflow-x-auto">
              <Text weight="plus" size="small" className="mb-3 block">
                Deductions
              </Text>
              <TableHeader col2="Input GST / Tax" col3="Total" />
              <MoneyTableRow
                label={`Platform fee (${PLATFORM_FEE_RATE}% of item basic)`}
                row={pricing.platformFee}
                muted
              />
              <MoneyTableRow
                label={`Commission (${COMMISSION_RATE}% of item basic)`}
                row={pricing.commissionFee}
                muted
              />
              <MoneyTableRow
                label={`Partner commission (${PARTNER_COMMISSION_RATE}% of listing)`}
                row={pricing.partnerCommission}
                muted
              />
              <MoneyTableRow
                label={`Logistics (GST ${FEE_GST_RATE}%)`}
                row={pricing.logisticsDeduction}
                muted
              />
              <MoneyTableRow
                label={`TCS (${TCS_RATE}% of item basic)`}
                row={pricing.tcs}
                muted
              />
              <MoneyTableRow
                label={`TDS (${TDS_RATE}% of item basic)`}
                row={pricing.tds}
                muted
              />
              <MoneyTableRow
                label="Total Deductions"
                row={pricing.totalDeductions}
                strong
              />
            </div>

            <div className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Text weight="plus" size="small" className="block">
                    Bank Settlement
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5 block">
                    Total listing price − total deductions
                  </Text>
                </div>
                <Text
                  size="large"
                  weight="plus"
                  className="tabular-nums text-emerald-800 text-xl"
                >
                  {formatInr(
                    hasPrice ? pricing.bankSettlementRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </Text>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
