"use client"

import Link from "next/link"
import { Text, clx } from "@medusajs/ui"
import type { ReactNode } from "react"
import type { VendorPaymentsView } from "@/lib/api/client"
import PayoutUnlockTimer from "@/components/PayoutUnlockTimer"

type Row = VendorPaymentsView["settlements"][number]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const money = (n: number | undefined, signed = false) => {
  const v = Number(n) || 0
  if (v === 0) return formatCurrency(0)
  if (signed && v < 0) return formatCurrency(v)
  return formatCurrency(v)
}

const formatGstRate = (rate: number | undefined | null) => {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `${n % 1 === 0 ? n.toFixed(0) : String(n)}%`
}

const CategoryBadge = ({ category }: { category: Row["category"] | Row["type"] }) => {
  const key = category === "sales" ? "sale" : category
  const label =
    key === "return"
      ? "Return"
      : key === "claim"
        ? "Claim"
        : key === "payment"
          ? "Payment"
          : key === "cancellation"
            ? "Cancel"
            : "Sale"
  return (
    <span
      className={clx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none",
        key === "return" && "bg-gradient-to-r from-red-500/10 to-red-500/5 text-red-600 ring-1 ring-red-500/15 dark:text-red-400",
        key === "claim" && "bg-gradient-to-r from-amber-500/10 to-amber-500/5 text-amber-700 ring-1 ring-amber-500/15 dark:text-amber-300",
        key === "payment" && "bg-gradient-to-r from-slate-500/10 to-slate-500/5 text-slate-600 ring-1 ring-slate-500/15 dark:text-slate-300",
        key === "cancellation" && "bg-gradient-to-r from-red-500/10 to-red-500/5 text-red-700 ring-1 ring-red-500/15 dark:text-red-300",
        (key === "sale" || !key) && "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300"
      )}
    >
      <span
        className={clx(
          "h-1.5 w-1.5 rounded-full",
          key === "return" && "bg-red-500",
          key === "claim" && "bg-amber-500",
          key === "payment" && "bg-slate-500",
          key === "cancellation" && "bg-red-500",
          (key === "sale" || !key) && "bg-emerald-500"
        )}
      />
      {label}
    </span>
  )
}

function owegCharges(row: Row) {
  return [
    { label: "Logistics", amount: row.logistic_total },
    { label: "Reverse logistics", amount: row.reverse_logistic_total },
    { label: "Cancellation", amount: row.cancellation_total },
    { label: "Payment gateway", amount: row.payment_gateway_total },
  ].filter((charge) => Math.abs(Number(charge.amount) || 0) > 0)
}

const StatusPill = ({ children, tone }: { children: ReactNode; tone: string }) => (
  <span
    className={clx(
      "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none",
      tone
    )}
  >
    {children}
  </span>
)

const cell = "px-3 py-2.5 text-xs border-b border-ui-border-base/50"
const groupBase =
  "px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest border-b-2"

const groupStyle =
  "bg-ui-bg-subtle/80 text-ui-fg-muted border-b-ui-border-base/60 dark:bg-ui-bg-subtle/50"

const TH = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <th
    scope="col"
    className={clx(
      cell,
      "bg-ui-bg-subtle/60 text-left text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted whitespace-nowrap",
      className
    )}
  >
    {children}
  </th>
)

const TD = ({
  children,
  className,
  muted,
  align = "left",
}: {
  children: ReactNode
  className?: string
  muted?: boolean
  align?: "left" | "right"
}) => (
  <td
    className={clx(
      cell,
      "tabular-nums whitespace-nowrap",
      align === "right" && "text-right",
      muted ? "text-ui-fg-muted" : "text-ui-fg-base",
      className
    )}
  >
    {children}
  </td>
)

const Money = ({
  value,
  strong,
  tone = "default",
}: {
  value: number | undefined
  strong?: boolean
  tone?: "default" | "return" | "cancellation"
}) => {
  const v = Number(value) || 0
  return (
    <TD
      align="right"
      className={clx(
        strong && "font-semibold",
        tone === "return" && "text-red-600 dark:text-red-400",
        tone === "cancellation" && "text-red-600 dark:text-red-400"
      )}
      muted={!strong && v === 0 && tone === "default"}
    >
      {money(value, true)}
    </TD>
  )
}

/** Product catalog sale = A + product GST. Never Sheet4 C (includes logistics). */
function productListingTotal(row: Row) {
  const orderAmt = Number(row.order_amount)
  if (Number.isFinite(orderAmt) && orderAmt !== 0) return orderAmt
  return (Number(row.taxable_amount) || 0) + (Number(row.gst_amount) || 0)
}

function sharedRateLabel(
  rows: Row[],
  pick: (row: Row) => number | undefined | null
): string | null {
  const rates = Array.from(
    new Set(
      rows
        .map((row) => Number(pick(row)))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  )
  if (rates.length === 1) {
    const n = rates[0]
    return `${n % 1 === 0 ? n.toFixed(0) : String(n)}%`
  }
  if (rates.length > 1) return "varies"
  return null
}

export default function PaymentLedgerTable({
  rows,
  onUnlock,
}: {
  rows: Row[]
  onUnlock: () => void
}) {
  // Payouts are first-class ledger events. Keep them visible so a vendor can
  // verify the exact bank transfer and UTR recorded by admin.
  const visible = rows

  const saleLike = visible.filter((row) => {
    const c = row.category || row.type
    return c === "sale" || c === "sales" || c === "return"
  })
  const platformHdr = sharedRateLabel(saleLike, (r) => r.platform_rate)
  const commissionHdr = sharedRateLabel(saleLike, (r) => r.commission_rate)
  const partnerHdr = sharedRateLabel(saleLike, (r) => r.partner_rate)
  const partnerLabel = partnerHdr ? `${partnerHdr} · linked only` : "Linked only"
  const tcsHdr = sharedRateLabel(saleLike, (r) => r.tcs_rate) || "0.5%"
  const tdsHdr = sharedRateLabel(saleLike, (r) => r.tds_rate) || "0.1%"

  const Group = ({
    children,
    colSpan,
    rate,
  }: {
    children: ReactNode
    colSpan?: number
    rate?: string | null
  }) => (
    <th colSpan={colSpan} className={clx(groupBase, groupStyle)}>
      <div className="flex flex-col items-center gap-0.5 leading-tight">
        <span>{children}</span>
        {rate ? (
          <span className="text-[10px] font-bold normal-case tracking-normal text-oweg-700 dark:text-oweg-400">
            {rate}
          </span>
        ) : null}
      </div>
    </th>
  )

  return (
    <div className="oweg-ledger-table overflow-hidden rounded-2xl border border-ui-border-base/60 bg-ui-bg-base shadow-lg shadow-black/[0.03]">
      <div className="overflow-x-auto oweg-scroll">
        <table className="min-w-[84rem] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              <Group colSpan={5}>Order</Group>
              <Group colSpan={6}>Listing</Group>
              <Group colSpan={3} rate="GST 18%">
                Shipping
              </Group>
              <Group colSpan={3} rate={platformHdr}>
                Platform
              </Group>
              <Group colSpan={3} rate={commissionHdr}>
                Commission
              </Group>
              <Group colSpan={3} rate={partnerLabel}>
                Partner
              </Group>
              <Group colSpan={3} rate="GST 18%">
                Logistics
              </Group>
              <Group colSpan={3} rate="GST 18%">
                Reverse logistics
              </Group>
              <Group colSpan={3} rate="GST 18%">
                Cancellation
              </Group>
              <Group colSpan={3} rate="2% + GST 18%">
                Payment gateway
              </Group>
              <Group>Cashback</Group>
              <Group>Claim</Group>
              <Group colSpan={2} rate={`${tcsHdr} / ${tdsHdr}`}>
                Tax deduct
              </Group>
              <Group colSpan={3}>Payment</Group>
              <Group colSpan={2}>Settlement</Group>
            </tr>
            <tr>
              <TH>Order ID</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Invoice</TH>
              <TH>Invoice no</TH>
              <TH className="text-right">Item price</TH>
              <TH className="text-right">GST rate</TH>
              <TH className="text-right">GST amount</TH>
              <TH className="text-right">Logistics</TH>
              <TH className="text-right">Logistics GST</TH>
              <TH className="text-right">Listing price</TH>
              <TH className="text-right">Customer shipping</TH>
              <TH className="text-right">Shipping GST</TH>
              <TH className="text-right">Shipping total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Fee</TH>
              <TH className="text-right">Tax</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Cashback (₹)</TH>
              <TH className="text-right">Amount</TH>
              <TH className="text-right">TCS</TH>
              <TH className="text-right">TDS</TH>
              <TH>Transaction ID</TH>
              <TH>Payment date</TH>
              <TH className="text-right">Payout</TH>
              <TH>Status</TH>
              <TH className="text-right">Balance</TH>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const category = row.category || (row.type === "sales" ? "sale" : row.type)
              const isPayout = category === "payment"
              const orderLabel = isPayout
                ? "Payout"
                : row.order_display_id || row.order_id.slice(0, 8)
              // Use delivered_at for delivered rows; fall back to order created date if available
              const dateSource = row.delivered_at
              const dateLabel = dateSource
                ? new Date(dateSource).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
                : "—"

              let statusNode: ReactNode = (
                <Text size="xsmall">{row.item_status || "—"}</Text>
              )
              // Strip trailing " · Paid" / " · Payout" / " · Payment" that the DB appends
              const cleanedStatus = (row.item_status || "")
                .replace(/\s*[·\-]\s*(paid|payout|payment).*/i, "")
                .trim()
              const rawStatus = cleanedStatus.toLowerCase()
              if (category === "return") {
                statusNode = (
                  <StatusPill tone="bg-red-50 text-red-600 ring-1 ring-red-500/15 dark:bg-red-900/20 dark:text-red-400">
                    Returned
                  </StatusPill>
                )
              } else if (category === "cancellation" || rawStatus.includes("cancel")) {
                statusNode = (
                  <StatusPill tone="bg-red-50 text-red-700 ring-1 ring-red-500/15 dark:bg-red-900/20 dark:text-red-300">
                    Cancelled
                  </StatusPill>
                )
              } else if (category === "claim") {
                statusNode = (
                  <StatusPill tone="bg-amber-50 text-amber-700 ring-1 ring-amber-500/15 dark:bg-amber-900/20 dark:text-amber-300">
                    Claim
                  </StatusPill>
                )
              } else if (isPayout) {
                statusNode = (
                  <StatusPill tone="bg-slate-100 text-slate-700 ring-1 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-200">
                    Paid out
                  </StatusPill>
                )
              } else if (row.status === "ON_HOLD") {
                statusNode = (
                  <StatusPill tone="bg-amber-50 text-amber-700 ring-1 ring-amber-500/15 dark:bg-amber-900/20 dark:text-amber-300">
                    Return hold
                  </StatusPill>
                )
              } else if (row.status === "UNLOCKING" && row.unlock_at) {
                statusNode = (
                  <PayoutUnlockTimer unlockAt={row.unlock_at} onComplete={onUnlock} />
                )
              } else if (row.status === "PAID") {
                statusNode = (
                  <StatusPill tone="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/15 dark:bg-emerald-900/20 dark:text-emerald-400">
                    Paid
                  </StatusPill>
                )
              } else if (rawStatus.includes("deliver") || row.delivered_at) {
                statusNode = (
                  <StatusPill tone="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/15 dark:bg-emerald-900/20 dark:text-emerald-400">
                    Delivered
                  </StatusPill>
                )
              } else if (rawStatus.includes("transit") || rawStatus.includes("ship") || (!row.delivered_at && category === "sale")) {
                statusNode = (
                  <StatusPill tone="bg-sky-50 text-sky-700 ring-1 ring-sky-500/15 dark:bg-sky-900/20 dark:text-sky-400">
                    In transit
                  </StatusPill>
                )
              }

              // Keep every figure in return and cancellation rows red, including fees and zeros.
              const moneyTone =
                category === "return"
                  ? "return"
                  : category === "cancellation"
                    ? "cancellation"
                    : "default"
              const isReturnOrCancel =
                category === "return" ||
                category === "cancellation" ||
                /replace/i.test(String(row.type || row.item_status || ""))
              const charges = owegCharges(row)
              const displayReturnFee = isReturnOrCancel && row.return_fee ? -Math.abs(row.return_fee) : row.return_fee
              const displayReverseGst = isReturnOrCancel && row.reverse_logistic_gst ? -Math.abs(row.reverse_logistic_gst) : row.reverse_logistic_gst
              const displayReverseTotal = isReturnOrCancel && row.reverse_logistic_total ? -Math.abs(row.reverse_logistic_total) : row.reverse_logistic_total
              const displayCancelFee = isReturnOrCancel && row.cancellation_fee ? -Math.abs(row.cancellation_fee) : row.cancellation_fee
              const displayCancelGst = isReturnOrCancel && row.cancellation_gst ? -Math.abs(row.cancellation_gst) : row.cancellation_gst
              const displayCancelTotal = isReturnOrCancel && row.cancellation_total ? -Math.abs(row.cancellation_total) : row.cancellation_total
              const displayPgFee = isReturnOrCancel && row.payment_gateway_fee ? -Math.abs(row.payment_gateway_fee) : row.payment_gateway_fee
              const displayPgGst = isReturnOrCancel && row.payment_gateway_gst ? -Math.abs(row.payment_gateway_gst) : row.payment_gateway_gst
              const displayPgTotal = isReturnOrCancel && row.payment_gateway_total ? -Math.abs(row.payment_gateway_total) : row.payment_gateway_total

              return (
                <tr
                  key={row.id}
                  className={clx(
                    "transition-colors duration-150",
                    isReturnOrCancel
                      ? "bg-ui-bg-base text-red-700 hover:bg-ui-bg-subtle/60 [&>td]:!text-red-700 [&>td_*]:!text-red-700 dark:bg-ui-bg-base dark:text-red-300 dark:hover:bg-ui-bg-subtle/60 dark:[&>td]:!text-red-300 dark:[&>td_*]:!text-red-300"
                      : index % 2 === 1
                        ? "bg-ui-bg-subtle/30"
                        : "bg-ui-bg-base",
                    !isReturnOrCancel && "hover:bg-oweg-500/[0.04] dark:hover:bg-oweg-500/[0.06]"
                  )}
                >
                  <TD className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {category === "claim" || isPayout ? (
                        <span className="text-ui-fg-muted">{orderLabel}</span>
                      ) : (
                        <Link
                          href={`/orders?order=${encodeURIComponent(row.order_id)}`}
                          className={clx(
                            "underline-offset-2 hover:underline font-semibold",
                            isReturnOrCancel
                              ? "text-red-700 dark:text-red-300"
                              : "text-oweg-700 dark:text-oweg-400"
                          )}
                        >
                          #{orderLabel}
                        </Link>
                      )}
                      {isReturnOrCancel ? (
                        <div className="group/info relative">
                          <button
                            type="button"
                            aria-label={`View OWEG charges for order ${orderLabel}`}
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/25 text-[10px] font-bold leading-none opacity-75 transition-opacity hover:opacity-100 focus:opacity-100"
                          >
                            i
                          </button>
                          <div className="pointer-events-none absolute left-0 top-6 z-20 hidden w-64 rounded-xl border border-ui-border-base bg-ui-bg-base p-3 text-xs text-ui-fg-base shadow-xl group-hover/info:block group-focus-within/info:block">
                          <p className="font-semibold">OWEG charges</p>
                          {charges.length ? (
                            <div className="mt-2 space-y-1.5">
                              {charges.map((charge) => (
                                <div key={charge.label} className="flex items-center justify-between gap-3">
                                  <span className="text-ui-fg-subtle">{charge.label}</span>
                                  <span className="font-semibold">{formatCurrency(Math.abs(Number(charge.amount) || 0))}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-ui-fg-subtle">No OWEG charges on this order.</p>
                          )}
                        </div>
                        </div>
                      ) : null}
                    </div>
                  </TD>
                  <TD muted>{dateLabel}</TD>
                  <TD>
                    <CategoryBadge category={category} />
                  </TD>
                  <TD muted>{dateLabel}</TD>
                  <TD muted>{row.invoice_no || "—"}</TD>
                  <Money value={row.taxable_amount} tone={moneyTone} />
                  <TD align="right" muted={!row.gst_rate}>
                    {formatGstRate(row.gst_rate)}
                  </TD>
                  <Money value={row.gst_amount} tone={moneyTone} />
                  <Money value={row.logistic_fee} tone={moneyTone} />
                  <Money value={row.logistic_gst} tone={moneyTone} />
                  <Money value={productListingTotal(row)} strong tone={moneyTone} />
                  <Money value={row.customer_shipping_fee} tone={moneyTone} />
                  <Money value={row.customer_shipping_gst} tone={moneyTone} />
                  <Money value={row.customer_shipping_total} strong tone={moneyTone} />
                  <Money value={row.platform_fee} tone={moneyTone} />
                  <Money value={row.platform_gst} tone={moneyTone} />
                  <Money value={row.platform_total} tone={moneyTone} />
                  <Money value={row.commission} tone={moneyTone} />
                  <Money value={row.commission_gst} tone={moneyTone} />
                  <Money value={row.commission_total} tone={moneyTone} />
                  <Money value={row.partner_commission} tone={moneyTone} />
                  <Money value={row.partner_gst} tone={moneyTone} />
                  <Money value={row.partner_total} tone={moneyTone} />
                  <Money value={row.logistic_fee} tone={moneyTone} />
                  <Money value={row.logistic_gst} tone={moneyTone} />
                  <Money value={row.logistic_total} tone={moneyTone} />
                  <Money value={displayReturnFee} tone={moneyTone} />
                  <Money value={displayReverseGst} tone={moneyTone} />
                  <Money value={displayReverseTotal} tone={moneyTone} />
                  <Money value={displayCancelFee} tone={moneyTone} />
                  <Money value={displayCancelGst} tone={moneyTone} />
                  <Money value={displayCancelTotal} tone={moneyTone} />
                  <Money value={displayPgFee} tone={moneyTone} />
                  <Money value={displayPgGst} tone={moneyTone} />
                  <Money value={displayPgTotal} tone={moneyTone} />
                  <Money value={row.cashback_amount} tone={moneyTone} />
                  <Money value={row.claim_amount} tone={moneyTone} />
                  <Money value={row.tcs} tone={moneyTone} />
                  <Money value={row.tds} tone={moneyTone} />
                  <TD muted>{row.transaction_id || "—"}</TD>
                  <TD muted>{row.payment_date
                    ? new Date(row.payment_date).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })
                    : "—"}</TD>
                  <Money value={row.payment} tone={isPayout ? "default" : moneyTone} />
                  <TD>{statusNode}</TD>
                  <Money value={row.balance_amount} strong tone={moneyTone} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="h-1 w-full bg-gradient-to-r from-oweg-400 via-oweg-500 to-oweg-600 opacity-80" />
    </div>
  )
}
