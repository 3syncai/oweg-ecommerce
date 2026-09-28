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
            ? "Cancellation"
            : "Sale"
  return (
    <span
      className={clx(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        key === "return" && "bg-red-500/10 text-red-700 dark:text-red-300",
        key === "claim" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
        key === "payment" && "bg-slate-500/10 text-slate-700 dark:text-slate-300",
        key === "cancellation" && "bg-orange-500/10 text-orange-800",
        (key === "sale" || !key) && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      )}
    >
      {label}
    </span>
  )
}

const StatusPill = ({ children, tone }: { children: ReactNode; tone: string }) => (
  <span className={clx("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", tone)}>
    {children}
  </span>
)

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
      "whitespace-nowrap px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-ui-fg-muted",
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
}: {
  children: ReactNode
  className?: string
  muted?: boolean
}) => (
  <td
    className={clx(
      "whitespace-nowrap px-2 py-2.5 tabular-nums text-xs",
      muted ? "text-ui-fg-muted" : "text-ui-fg-base",
      className
    )}
  >
    {children}
  </td>
)

export default function PaymentLedgerTable({
  rows,
  onUnlock,
}: {
  rows: Row[]
  onUnlock: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[96rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-ui-border-base bg-ui-bg-subtle/90">
              <th colSpan={5} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Order
              </th>
              <th colSpan={4} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Listing A / B / A+B / C
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold">Status</th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Platform D @5%
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Commission E
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Partner F
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Logistics B
              </th>
              <th colSpan={2} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                G / H
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">I</th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Reverse J
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Cancel K
              </th>
              <th className="px-2 py-1.5 text-[11px] font-semibold">L</th>
              <th colSpan={4} className="px-2 py-1.5 text-[11px] font-semibold text-ui-fg-base">
                Bank settlements
              </th>
            </tr>
            <tr className="border-b border-ui-border-base bg-ui-bg-subtle/60">
              <TH>Order ID</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Invoice</TH>
              <TH>Invoice no</TH>
              <TH>Item price (A)</TH>
              <TH>Logistics (B)</TH>
              <TH>GST (A+B)</TH>
              <TH>Listing (C)</TH>
              <TH>Item status</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>TCS 0.5%</TH>
              <TH>TDS 0.1%</TH>
              <TH>Bank settlement</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>Fee</TH>
              <TH>Tax</TH>
              <TH>Total</TH>
              <TH>Claim</TH>
              <TH>Txn ID</TH>
              <TH>Payment date</TH>
              <TH>Payment</TH>
              <TH>Balance</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-border-base/50">
            {rows.map((row) => {
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
                  <StatusPill tone="bg-ui-bg-subtle text-ui-fg-muted">Returned</StatusPill>
                )
              } else if (category === "claim") {
                statusNode = (
                  <StatusPill tone="bg-amber-500/10 text-amber-800">Claim</StatusPill>
                )
              } else if (category === "payment") {
                statusNode = (
                  <StatusPill tone="bg-slate-500/10 text-slate-700">Paid out</StatusPill>
                )
              } else if (row.status === "ON_HOLD") {
                statusNode = (
                  <StatusPill tone="bg-amber-500/10 text-amber-800">Return hold</StatusPill>
                )
              } else if (row.status === "UNLOCKING" && row.unlock_at) {
                statusNode = (
                  <PayoutUnlockTimer unlockAt={row.unlock_at} onComplete={onUnlock} />
                )
              } else if (row.status === "PAID") {
                statusNode = (
                  <StatusPill tone="bg-ui-bg-subtle text-ui-fg-subtle">Paid</StatusPill>
                )
              }

              return (
                <tr key={row.id} className="hover:bg-ui-bg-subtle/40">
                  <TD className="font-medium">
                    {category === "claim" || category === "payment" ? (
                      orderLabel
                    ) : (
                      <Link
                        href={`/orders?order=${encodeURIComponent(row.order_id)}`}
                        className="text-oweg-700 underline-offset-2 hover:underline dark:text-oweg-300"
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
                  <TD>{money(row.taxable_amount, true)}</TD>
                  <TD>{money(row.logistic_fee, true)}</TD>
                  <TD>{money(row.listing_gst ?? row.gst_amount, true)}</TD>
                  <TD className="font-medium">{money(row.listing_total, true)}</TD>
                  <TD>{statusNode}</TD>
                  <TD muted>{money(row.platform_fee, true)}</TD>
                  <TD muted>{money(row.platform_gst, true)}</TD>
                  <TD>{money(row.platform_total, true)}</TD>
                  <TD muted>{money(row.commission, true)}</TD>
                  <TD muted>{money(row.commission_gst, true)}</TD>
                  <TD>{money(row.commission_total, true)}</TD>
                  <TD muted>{money(row.partner_commission, true)}</TD>
                  <TD muted>{money(row.partner_gst, true)}</TD>
                  <TD>{money(row.partner_total, true)}</TD>
                  <TD muted>{money(row.logistic_fee, true)}</TD>
                  <TD muted>{money(row.logistic_gst, true)}</TD>
                  <TD>{money(row.logistic_total, true)}</TD>
                  <TD muted>{money(row.tcs, true)}</TD>
                  <TD muted>{money(row.tds, true)}</TD>
                  <TD className="font-semibold">{money(row.bank_settlement ?? row.settlement_amount, true)}</TD>
                  <TD muted>{money(row.return_fee, true)}</TD>
                  <TD muted>{money(row.reverse_logistic_gst, true)}</TD>
                  <TD>{money(row.reverse_logistic_total, true)}</TD>
                  <TD muted>{money(row.cancellation_fee, true)}</TD>
                  <TD muted>{money(row.cancellation_gst, true)}</TD>
                  <TD>{money(row.cancellation_total, true)}</TD>
                  <TD>{money(row.claim_amount, true)}</TD>
                  <TD muted>{row.transaction_id || "—"}</TD>
                  <TD muted>
                    {row.payment_date
                      ? new Date(row.payment_date).toLocaleDateString("en-IN")
                      : "—"}
                  </TD>
                  <TD className={clx((row.payment || 0) < 0 && "text-red-600")}>
                    {money(row.payment, true)}
                  </TD>
                  <TD className="font-semibold">{money(row.balance_amount, true)}</TD>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
