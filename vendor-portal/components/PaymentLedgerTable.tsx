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
        key === "cancellation" && "bg-gradient-to-r from-orange-500/10 to-orange-500/5 text-orange-700 ring-1 ring-orange-500/15",
        (key === "sale" || !key) && "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300"
      )}
    >
      <span
        className={clx(
          "h-1.5 w-1.5 rounded-full",
          key === "return" && "bg-red-500",
          key === "claim" && "bg-amber-500",
          key === "payment" && "bg-slate-500",
          key === "cancellation" && "bg-orange-500",
          (key === "sale" || !key) && "bg-emerald-500"
        )}
      />
      {label}
    </span>
  )
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
        tone === "cancellation" && "text-orange-600 dark:text-orange-400"
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
  const visible = rows.filter((row) => {
    const category = row.category || row.type
    return category !== "payment"
  })

  const saleLike = visible.filter((row) => {
    const c = row.category || row.type
    return c === "sale" || c === "sales" || c === "return"
  })
  const platformHdr = sharedRateLabel(saleLike, (r) => r.platform_rate)
  const commissionHdr = sharedRateLabel(saleLike, (r) => r.commission_rate)
  const partnerHdr = sharedRateLabel(saleLike, (r) => r.partner_rate)
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
              <Group colSpan={5}>Listing</Group>
              <Group colSpan={3} rate={platformHdr}>
                Platform
              </Group>
              <Group colSpan={3} rate={commissionHdr}>
                Commission
              </Group>
              <Group colSpan={3} rate={partnerHdr}>
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
              <Group>Claim</Group>
              <Group colSpan={2} rate={`${tcsHdr} / ${tdsHdr}`}>
                Tax deduct
              </Group>
              <Group colSpan={2}>Settlement</Group>
            </tr>
            <tr>
              <TH>Order ID</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Invoice</TH>
              <TH>Invoice no</TH>
              <TH className="text-right">Item price</TH>
              <TH className="text-right">Logistics</TH>
              <TH className="text-right">GST rate</TH>
              <TH className="text-right">GST amount</TH>
              <TH className="text-right">Listing total</TH>
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
              <TH className="text-right">Amount</TH>
              <TH className="text-right">TCS</TH>
              <TH className="text-right">TDS</TH>
              <TH>Status</TH>
              <TH className="text-right">Balance</TH>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const category = row.category || (row.type === "sales" ? "sale" : row.type)
              const orderLabel = row.order_display_id || row.order_id.slice(0, 8)
              const dateLabel = row.delivered_at
                ? new Date(row.delivered_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"

              let statusNode: ReactNode = (
                <Text size="xsmall">{row.item_status || "—"}</Text>
              )
              if (category === "return") {
                statusNode = (
                  <StatusPill tone="bg-red-50 text-red-600 ring-1 ring-red-500/15 dark:bg-red-900/20 dark:text-red-400">
                    Returned
                  </StatusPill>
                )
              } else if (category === "claim") {
                statusNode = (
                  <StatusPill tone="bg-amber-50 text-amber-700 ring-1 ring-amber-500/15 dark:bg-amber-900/20 dark:text-amber-300">
                    Claim
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
              } else if (row.item_status === "Delivered") {
                statusNode = (
                  <StatusPill tone="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/15 dark:bg-emerald-900/20 dark:text-emerald-400">
                    Delivered
                  </StatusPill>
                )
              }

              const moneyTone =
                category === "return"
                  ? "return"
                  : category === "cancellation"
                    ? "cancellation"
                    : "default"

              return (
                <tr
                  key={row.id}
                  className={clx(
                    "transition-colors duration-150",
                    index % 2 === 1 ? "bg-ui-bg-subtle/30" : "bg-ui-bg-base",
                    "hover:bg-oweg-500/[0.04] dark:hover:bg-oweg-500/[0.06]"
                  )}
                >
                  <TD className="font-medium">
                    {category === "claim" ? (
                      <span className="text-ui-fg-muted">{orderLabel}</span>
                    ) : (
                      <Link
                        href={`/orders?order=${encodeURIComponent(row.order_id)}`}
                        className="text-oweg-700 underline-offset-2 hover:underline dark:text-oweg-400 font-semibold"
                      >
                        #{orderLabel}
                      </Link>
                    )}
                  </TD>
                  <TD muted>{dateLabel}</TD>
                  <TD>
                    <CategoryBadge category={category} />
                  </TD>
                  <TD muted>{dateLabel}</TD>
                  <TD muted>{row.invoice_no || "—"}</TD>
                  <Money value={row.taxable_amount} tone={moneyTone} />
                  <Money value={row.logistic_fee} tone={moneyTone} />
                  <TD align="right" muted={!row.gst_rate}>
                    {formatGstRate(row.gst_rate)}
                  </TD>
                  <Money value={row.gst_amount} tone={moneyTone} />
                  <Money value={productListingTotal(row)} strong tone={moneyTone} />
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
                  <Money value={row.return_fee} tone={moneyTone} />
                  <Money value={row.reverse_logistic_gst} tone={moneyTone} />
                  <Money value={row.reverse_logistic_total} tone={moneyTone} />
                  <Money value={row.cancellation_fee} tone={moneyTone} />
                  <Money value={row.cancellation_gst} tone={moneyTone} />
                  <Money value={row.cancellation_total} tone={moneyTone} />
                  <Money value={row.claim_amount} tone={moneyTone} />
                  <Money value={row.tcs} tone={moneyTone} />
                  <Money value={row.tds} tone={moneyTone} />
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
