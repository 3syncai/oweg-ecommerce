"use client"

import React, { useMemo, useState, useEffect } from "react"
import { Button, Heading, Input, Label, Text } from "@medusajs/ui"
import { InformationCircleSolid } from "@medusajs/icons"
import ShippingEstimateDetails from "@/components/ShippingEstimateDetails"
import type { ShippingEstimate } from "@/lib/shipping-estimate"
import {
  COMMISSION_RATE,
  DEFAULT_LOGISTICS_FEE,
  FEE_GST_RATE,
  LOGISTICS_GST_RATE,
  PARTNER_COMMISSION_RATE,
  PAYMENT_GATEWAY_RATE,
  PLATFORM_FEE_RATE,
  PRODUCT_GST_RATE,
  TCS_RATE,
  TDS_RATE,
} from "@/lib/pricingConfig"
import {
  calculateVendorPricing,
  getCalculatorProductPrice,
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

export type LogisticsEstimateDetails = Partial<ShippingEstimate> & {
  freight_charge?: number
  gst_rate?: number
  gst_amount?: number
  total_logistics_fee?: number
  courier_name?: string
  pickup_pincode?: string
  delivery_pincode?: string
  provider?: string
}

export type ProductPriceCalculatorProps = {
  variants?: Array<{ id?: string; title?: string; sku?: string; price?: string | number; discountedPrice?: string | number }>
  productGstRate?: number | string
  taxCode?: string
  logisticsFee?: number
  isLogisticsReadOnly?: boolean
  logisticsDetails?: LogisticsEstimateDetails | null
  isFetchingLogistics?: boolean
}

export default function ProductPriceCalculator({
  variants = [],
  productGstRate,
  taxCode,
  logisticsFee,
  isLogisticsReadOnly = true,
  logisticsDetails,
  isFetchingLogistics = false,
}: ProductPriceCalculatorProps = {}) {
  const [variantIndex, setVariantIndex] = useState(0)
  const selectedVariant = variants[variantIndex] || variants[0]
  const productPrice = getCalculatorProductPrice(selectedVariant?.price, selectedVariant?.discountedPrice)
  const [priceInput, setPriceInput] = useState(productPrice)

  // Saved prices may arrive after mount; edits and variant changes update the estimate too.
  useEffect(() => {
    setPriceInput(productPrice)
  }, [productPrice, variantIndex, selectedVariant?.id])
  const [logisticsInput, setLogisticsInput] = useState(
    logisticsFee != null ? String(logisticsFee) : String(DEFAULT_LOGISTICS_FEE)
  )
  const [expanded, setExpanded] = useState(false)
  const [showShippingCreditInfo, setShowShippingCreditInfo] = useState(false)

  // Sync logisticsInput when logisticsFee prop updates (e.g. from ITL API fetch)
  useEffect(() => {
    if (logisticsFee != null && !isNaN(logisticsFee) && logisticsFee >= 0) {
      setLogisticsInput(String(logisticsFee))
    }
  }, [logisticsFee])

  const effectiveProductGstRate = useMemo(() => {
    if (
      productGstRate !== undefined &&
      productGstRate !== "" &&
      productGstRate !== null &&
      !isNaN(Number(productGstRate))
    ) {
      const n = Number(productGstRate)
      if (n >= 0) return n
    }
    return PRODUCT_GST_RATE
  }, [productGstRate])

  const pricing = useMemo(
    () =>
      calculateVendorPricing(
        parseNonNegativeNumber(priceInput),
        parseNonNegativeNumber(logisticsInput),
        effectiveProductGstRate
      ),
    [priceInput, logisticsInput, effectiveProductGstRate]
  )

  const hasPrice = pricing.item.total > 0

  const onPriceChange = (value: string) => {
    const next = allowDecimalInput(value)
    if (next === null) return
    setPriceInput(next)
  }

  const onLogisticsChange = (value: string) => {
    const next = allowDecimalInput(value)
    if (next === null) return
    setLogisticsInput(next)
  }

  const reset = () => {
    setPriceInput(productPrice)
    setLogisticsInput(String(DEFAULT_LOGISTICS_FEE))
    setExpanded(false)
  }

  return (
    <div className="rounded-2xl border border-ui-border-base/70 bg-ui-bg-base shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-ui-border-base/60 bg-ui-bg-subtle/30 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="h3" className="text-base font-semibold tracking-tight">
              Product Price Calculator
            </Heading>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
              GST: {effectiveProductGstRate}%
              {taxCode ? ` · ${taxCode}` : ""}
            </span>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
            All-inclusive product pricing with dynamic tax and fee deductions
          </Text>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={reset}
          type="button"
          className="text-xs text-ui-fg-muted hover:text-ui-fg-base"
        >
          Reset
        </Button>
      </div>

      <div className="p-5 space-y-5">
        {variants.length > 1 && (
          <div>
            <Label htmlFor="calculator-variant" className="text-xs">Variant to calculate</Label>
            <select
              id="calculator-variant"
              value={variants[variantIndex] ? variantIndex : 0}
              onChange={event => setVariantIndex(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
            >
              {variants.map((variant, index) => (
                <option key={variant.id || index} value={index}>{variant.title || variant.sku || `Variant ${index + 1}`}</option>
              ))}
            </select>
          </div>
        )}
        {/* Top inputs and summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Left: Inputs */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="vendor-product-price" className="text-xs font-semibold text-ui-fg-base">
                  Product Price
                </Label>
                <span className="text-[11px] text-ui-fg-muted">GST inclusive</span>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted text-sm font-medium">
                  ₹
                </span>
                <Input
                  id="vendor-product-price"
                  inputMode="decimal"
                  placeholder="Enter product price (e.g. 1360)"
                  value={priceInput}
                  onChange={(e) => onPriceChange(e.target.value)}
                  className="pl-7 text-base h-10 rounded-lg"
                  aria-describedby="vendor-product-price-hint"
                />
              </div>
              <Text
                id="vendor-product-price-hint"
                size="xsmall"
                className="text-ui-fg-muted mt-1.5 block text-[11px] leading-relaxed"
                aria-live="polite"
                aria-atomic="true"
              >
                {hasPrice ? (
                  <span>
                    Product basic: <strong>{formatInr(pricing.item.basic)}</strong>
                    {" + "}{effectiveProductGstRate}% GST (
                    <strong>{formatInr(pricing.item.gstOrTax)}</strong>) ={" "}
                    <strong>{formatInr(pricing.item.total)}</strong> (GST inclusive).
                  </span>
                ) : (
                  `Enter a product price to see its basic price + ${effectiveProductGstRate}% GST breakdown.`
                )}
              </Text>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="vendor-logistics-fee" className="text-xs font-semibold text-ui-fg-base">
                    Logistics Fee
                  </Label>
                  <span className="inline-flex items-center gap-1 rounded-md bg-ui-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ui-fg-muted ring-1 ring-ui-border-base">
                    <svg className="w-2.5 h-2.5 text-ui-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Non-editable
                  </span>
                </div>
                {isFetchingLogistics ? (
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                    Calculating delivery fee...
                  </span>
                ) : logisticsDetails ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                    Auto-calculated
                  </span>
                ) : (
                  <span className="text-[11px] text-ui-fg-muted">Auto-calculated</span>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted text-sm font-medium">
                  ₹
                </span>
                <Input
                  id="vendor-logistics-fee"
                  inputMode="decimal"
                  placeholder={String(DEFAULT_LOGISTICS_FEE)}
                  value={logisticsInput}
                  readOnly={isLogisticsReadOnly}
                  disabled={isLogisticsReadOnly}
                  onChange={(e) => {
                    if (!isLogisticsReadOnly) {
                      onLogisticsChange(e.target.value)
                    }
                  }}
                  className="pl-7 pr-24 text-base h-10 rounded-lg bg-ui-bg-subtle/70 text-ui-fg-base cursor-not-allowed select-none font-medium opacity-90"
                  aria-describedby="vendor-logistics-fee-hint"
                />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-medium text-ui-fg-muted">
                  <span>+ 18% GST</span>
                </div>
              </div>
              <Text
                id="vendor-logistics-fee-hint"
                size="xsmall"
                className="text-ui-fg-muted mt-1.5 block text-[11px] leading-relaxed"
              >
                {isFetchingLogistics ? (
                  <span className="text-blue-600 dark:text-blue-400">
                    Calculating delivery charges from package attributes...
                  </span>
                ) : logisticsDetails ? (
                  <span>
                    Delivery fee: <strong>₹{pricing.logistics.basic.toFixed(2)}</strong> basic + 18% GST (<strong>₹{pricing.logistics.gstOrTax.toFixed(2)}</strong>) = <strong>₹{pricing.logistics.total.toFixed(2)}</strong> total.
                  </span>
                ) : (
                  <span>
                    Logistics basic: <strong>₹{pricing.logistics.basic.toFixed(2)}</strong> + 18% GST (<strong>₹{pricing.logistics.gstOrTax.toFixed(2)}</strong>) = <strong>₹{pricing.logistics.total.toFixed(2)}</strong>. Auto-calculated from package attributes.
                  </span>
                )}
              </Text>
              {logisticsDetails && <ShippingEstimateDetails estimate={logisticsDetails} />}
            </div>

            <div className="rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle/40 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div>
                <Text size="xsmall" className="text-ui-fg-muted block">
                  Total Listing Price
                </Text>
                <span className="text-[11px] text-ui-fg-muted">
                  Shown to customer on storefront
                </span>
              </div>
              <Text
                size="base"
                weight="plus"
                className={`tabular-nums text-lg font-semibold ${
                  hasPrice ? "text-ui-fg-base" : "text-ui-fg-muted"
                }`}
              >
                {formatInr(
                  hasPrice ? pricing.totalListingPriceRounded : 0,
                  hasPrice ? 0 : 2
                )}
              </Text>
            </div>

            {hasPrice && pricing.customerShipping.total > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 flex items-center justify-between gap-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Text size="xsmall" className="text-emerald-800 dark:text-emerald-300 block font-semibold">
                    Customer shipping collected
                    </Text>
                    <button
                      type="button"
                      className="relative inline-flex text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
                      aria-label="Customer shipping credit information"
                      aria-expanded={showShippingCreditInfo}
                      onClick={() => setShowShippingCreditInfo((visible) => !visible)}
                      onMouseEnter={() => setShowShippingCreditInfo(true)}
                      onMouseLeave={() => setShowShippingCreditInfo(false)}
                      onFocus={() => setShowShippingCreditInfo(true)}
                      onBlur={() => setShowShippingCreditInfo(false)}
                    >
                      <InformationCircleSolid className="h-4 w-4" />
                      {showShippingCreditInfo ? (
                        <span
                          role="tooltip"
                          className="absolute bottom-full left-0 z-30 mb-2 w-52 rounded-lg bg-zinc-900 px-3 py-2 text-left text-xs font-normal text-white shadow-lg"
                        >
                          This will be adjusted in payment.
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                    Below ₹500 · ₹{pricing.customerShipping.basic.toFixed(2)} + GST ₹{pricing.customerShipping.gstOrTax.toFixed(2)}
                  </span>
                </div>
                <Text size="base" weight="plus" className="tabular-nums text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatInr(pricing.customerShipping.total, 0)}
                </Text>
              </div>
            ) : null}
          </div>

          {/* Right: Settlement Summary Card */}
          <div
            className={`rounded-xl border p-4 sm:p-5 flex flex-col justify-between transition-colors ${
              hasPrice
                ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                : "border-ui-border-base/70 bg-ui-bg-subtle/30"
            }`}
          >
            <div className="space-y-4">
              {/* Bank Settlement */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider text-[11px]">
                    Bank Settlement
                  </Text>
                  <span className="text-[11px] text-ui-fg-muted tabular-nums">
                    Total Listing Price - Total Deductions + Shipping (excl. GST)
                  </span>
                </div>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${
                    hasPrice ? "text-ui-fg-base" : "text-ui-fg-muted"
                  }`}
                >
                  {formatInr(
                    hasPrice ? pricing.bankSettlementRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </p>
              </div>

              {/* Final Settlement */}
              <div className="rounded-xl border border-sky-300/80 bg-sky-50/80 p-3.5 dark:border-sky-800/80 dark:bg-sky-950/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Text size="small" weight="plus" className="text-sky-950 font-bold dark:text-sky-100">
                      Final Settlement
                    </Text>
                    <Text size="xsmall" className="text-sky-800/90 dark:text-sky-300/80 mt-0.5 block text-[11px]">
                      Total Listing Price - Total Deductions + Shipping (excl. GST) + INPUT GST &amp; TAXES
                    </Text>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums text-sky-950 dark:text-sky-100 shrink-0">
                    {formatInr(
                      hasPrice ? pricing.finalSettlementRounded : 0,
                      hasPrice ? 0 : 2
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Metrics Footer */}
            <div className="mt-4 pt-3 border-t border-ui-border-base/60 grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-ui-bg-base/80 border border-ui-border-base/50 px-3 py-2">
                <Text size="xsmall" className="text-ui-fg-muted block text-[11px]">
                  Total Listing Price
                </Text>
                <Text
                  size="small"
                  weight="plus"
                  className="tabular-nums text-ui-fg-base mt-0.5"
                >
                  {formatInr(
                    hasPrice ? pricing.totalListingPriceRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </Text>
              </div>
              <div className="rounded-lg bg-ui-bg-base/80 border border-ui-border-base/50 px-3 py-2">
                <Text size="xsmall" className="text-ui-fg-muted block text-[11px]">
                  Total Deductions
                </Text>
                <Text
                  size="small"
                  weight="plus"
                  className="tabular-nums text-ui-fg-base mt-0.5"
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

        {/* Detailed breakdown toggle */}
        <div className="pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ui-fg-interactive hover:text-ui-fg-interactive-hover transition-colors"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide detailed breakdown" : "View detailed breakdown"}
            <span className="text-xs leading-none transition-transform">{expanded ? "▴" : "▾"}</span>
          </button>
        </div>

        {/* Detailed Breakdown */}
        {expanded ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-ui-border-base/70 p-4 bg-ui-bg-base overflow-x-auto shadow-sm">
              <Text weight="plus" size="small" className="mb-3 block font-semibold text-ui-fg-base">
                Listing Price
              </Text>
              <TableHeader col2="Output GST" col3="Total" />
              <MoneyTableRow
                label={`Item price (incl. GST ${effectiveProductGstRate}%)`}
                row={pricing.item}
              />
              <MoneyTableRow
                label={`Logistics (GST ${LOGISTICS_GST_RATE}%)`}
                row={pricing.logistics}
                muted
              />
              <MoneyTableRow
                label="Customer shipping (₹42.37 credited; ₹7.63 GST retained)"
                row={pricing.customerShipping}
                strong
              />
              <MoneyTableRow
                label="Total Listing Price"
                row={pricing.listing}
                strong
              />
            </div>

            <div className="rounded-xl border border-ui-border-base/70 p-4 bg-ui-bg-base overflow-x-auto shadow-sm">
              <Text weight="plus" size="small" className="mb-3 block font-semibold text-ui-fg-base">
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
                label={`Payment gateway charges (${PAYMENT_GATEWAY_RATE}% of listing)`}
                row={pricing.paymentGatewayFee}
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

            {/* Bank Settlement Card */}
            <div className="rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle/40 p-4 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Text weight="plus" size="small" className="block font-semibold text-ui-fg-base">
                    Bank Settlement
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5 block text-[11px]">
                    Total Listing Price - Total Deductions + Shipping (excl. GST)
                  </Text>
                </div>
                <Text
                  size="large"
                  weight="plus"
                  className="tabular-nums text-ui-fg-base text-xl font-bold"
                >
                  {formatInr(
                    hasPrice ? pricing.bankSettlementRounded : 0,
                    hasPrice ? 0 : 2
                  )}
                </Text>
              </div>
            </div>

            {/* Final Settlement Card */}
            <div className="rounded-xl border border-sky-300/90 bg-sky-50/90 p-4 dark:border-sky-800 dark:bg-sky-950/40 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Text weight="plus" size="small" className="block text-sky-950 font-bold dark:text-sky-100">
                    Final Settlement
                  </Text>
                  <Text size="xsmall" className="text-sky-800/90 mt-0.5 block dark:text-sky-300/90 font-medium text-[11px]">
                    Total Listing Price - Total Deductions + Shipping (excl. GST) + INPUT GST &amp; TAXES
                  </Text>
                </div>
                <Text
                  size="xlarge"
                  weight="plus"
                  className="tabular-nums text-sky-950 font-bold text-2xl dark:text-sky-100"
                >
                  {formatInr(
                    hasPrice ? pricing.finalSettlementRounded : 0,
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
