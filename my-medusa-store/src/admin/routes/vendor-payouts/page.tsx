import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar, ChevronDownMini } from "@medusajs/icons"
import {
  Container,
  Heading,
  Button,
  Badge,
  Table,
  toast,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

type Vendor = {
  id: string
  name: string
  email: string
  phone: string
  bank_name: string | null
  account_no: string | null
  ifsc_code: string | null
  is_approved: boolean
}

type PayableLineItem = {
  id: string
  order_id: string
  order_display_id: string | null
  product_name: string
  type: "sales" | "claim"
  order_amount: number
  commission: number
  tcs: number
  tds: number
  logistic_fee: number
  pay_amount: number
}

type PendingPayout = {
  vendor_id: string
  vendor_name: string
  total_revenue: number
  commission: number
  logistic_fee: number
  net_amount: number
  commission_rate: number
  commission_source?: "global" | "custom"
  order_count: number
  order_ids: string[]
  line_items: PayableLineItem[]
  unlocking_balance?: number
  unlocking_count?: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)

const PayableLinesDropdown = ({
  payout,
  open,
  onToggle,
}: {
  payout: PendingPayout
  open: boolean
  onToggle: () => void
}) => {
  const lines = payout.line_items || []
  const count = payout.order_count || lines.length

  if (count <= 0) {
    return <span className="text-ui-fg-muted">0</span>
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 text-left transition-colors hover:bg-ui-bg-subtle"
        aria-expanded={open}
      >
        <Badge color="blue">{count}</Badge>
        <span className="text-xs text-ui-fg-subtle">View items</span>
        <ChevronDownMini
          className={`text-ui-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-[min(34rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
          <div className="border-b border-ui-border-base bg-ui-bg-subtle px-3 py-2">
            <Text size="small" weight="plus">
              Paying for {count} item{count === 1 ? "" : "s"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              Pay = after commission + Easy Ship logistic (Self Ship = ₹0)
            </Text>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ui-bg-base">
                <tr className="border-b border-ui-border-base text-xs text-ui-fg-muted">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium text-right">Logistic</th>
                  <th className="px-3 py-2 font-medium text-right">Pay</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const orderLabel =
                    line.type === "claim"
                      ? line.order_display_id || "Claim"
                      : `#${line.order_display_id || line.order_id.slice(0, 8)}`
                  const logistic = Number(line.logistic_fee) || 0
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-ui-border-base/60 last:border-0"
                    >
                      <td className="max-w-[11rem] px-3 py-2.5">
                        <p className="truncate font-medium" title={line.product_name}>
                          {line.product_name}
                        </p>
                        <p className="text-xs text-ui-fg-muted">
                          {line.type === "claim" ? "Claim credit" : "Sale"}
                          {line.commission > 0
                            ? ` · −${formatCurrency(line.commission)} commission`
                            : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ui-fg-subtle">
                        {orderLabel}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
                          logistic > 0 ? "font-medium text-red-600" : "text-ui-fg-muted"
                        }`}
                      >
                        {logistic > 0 ? `−${formatCurrency(logistic)}` : "₹0"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-green-600">
                        {formatCurrency(line.pay_amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 border-t border-ui-border-base bg-ui-bg-subtle px-3 py-2">
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Logistic total (Easy Ship)
              </Text>
              <Text
                size="small"
                className={
                  (payout.logistic_fee || 0) > 0 ? "text-red-600" : "text-ui-fg-muted"
                }
              >
                {(payout.logistic_fee || 0) > 0
                  ? `−${formatCurrency(payout.logistic_fee)}`
                  : "₹0"}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Total to pay
              </Text>
              <Text size="small" weight="plus" className="text-green-600">
                {formatCurrency(payout.net_amount)}
              </Text>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const VendorPayoutsPage = () => {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [pendingPayouts, setPendingPayouts] = useState<Record<string, PendingPayout>>({})
  const [loading, setLoading] = useState(true)
  const [processingVendor, setProcessingVendor] = useState<string | null>(null)
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [transactionId, setTransactionId] = useState("")
  const [remark, setRemark] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!expandedVendorId) return
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.("[data-payable-dropdown]")) return
      setExpandedVendorId(null)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [expandedVendorId])

  const loadData = async () => {
    try {
      setLoading(true)
      setExpandedVendorId(null)

      const vendorsRes = await fetch("/admin/vendors/all", {
        credentials: "include",
      })

      if (!vendorsRes.ok) {
        throw new Error("Failed to fetch vendors")
      }

      const vendorsData = await vendorsRes.json()
      const approvedVendors =
        vendorsData.vendors?.filter((v: Vendor) => v.is_approved) || []
      setVendors(approvedVendors)

      const payoutPromises = approvedVendors.map(async (vendor: Vendor) => {
        try {
          const res = await fetch(`/admin/vendor-payouts/calculate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ vendor_id: vendor.id }),
          })

          if (!res.ok) return null

          const data = await res.json()
          return {
            vendor_id: vendor.id,
            data,
          }
        } catch (err) {
          console.error(`Failed to calculate payout for ${vendor.name}:`, err)
          return null
        }
      })

      const results = await Promise.all(payoutPromises)
      const payoutsMap: Record<string, PendingPayout> = {}

      results.forEach((result) => {
        if (result && result.data) {
          payoutsMap[result.vendor_id] = {
            vendor_id: result.vendor_id,
            vendor_name: result.data.vendor_name,
            total_revenue: result.data.total_revenue || 0,
            commission: result.data.commission || 0,
            logistic_fee: Number(result.data.logistic_fee) || 0,
            net_amount: result.data.net_amount || 0,
            commission_rate: result.data.commission_rate || 0,
            commission_source: result.data.commission_source,
            order_count: result.data.order_count || 0,
            order_ids: result.data.order_ids || [],
            line_items: Array.isArray(result.data.line_items)
              ? result.data.line_items.map((line: PayableLineItem) => ({
                  ...line,
                  logistic_fee: Number(line.logistic_fee) || 0,
                }))
              : [],
            unlocking_balance: result.data.unlocking_balance || 0,
            unlocking_count: result.data.unlocking_count || 0,
          }
        }
      })

      setPendingPayouts(payoutsMap)
    } catch (error) {
      console.error("Load data error:", error)
      toast.error("Failed to load vendors and payouts")
    } finally {
      setLoading(false)
    }
  }

  const openPayModal = (vendor: Vendor) => {
    const payout = pendingPayouts[vendor.id]
    if (!payout || payout.net_amount <= 0) {
      toast.warning("No pending amount to pay for this vendor")
      return
    }
    if (!vendor.bank_name || !vendor.account_no || !vendor.ifsc_code) {
      toast.error(
        `Bank details missing for ${vendor.name}. Please update vendor information.`
      )
      return
    }
    setExpandedVendorId(null)
    setSelectedVendor(vendor)
    setTransactionId("")
    setRemark("")
    setPayModalOpen(true)
  }

  const closePayModal = () => {
    if (processingVendor) return
    setPayModalOpen(false)
    setSelectedVendor(null)
    setTransactionId("")
    setRemark("")
  }

  const handleConfirmPay = async () => {
    if (!selectedVendor) return
    const payout = pendingPayouts[selectedVendor.id]
    if (!payout || payout.net_amount <= 0) {
      toast.warning("No pending amount to pay for this vendor")
      return
    }

    const txn = transactionId.trim()
    if (!txn) {
      toast.error("Transaction ID is required")
      return
    }

    try {
      setProcessingVendor(selectedVendor.id)

      const res = await fetch("/admin/vendor-payouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          vendor_id: selectedVendor.id,
          amount: payout.total_revenue,
          commission_amount: payout.commission,
          net_amount: payout.net_amount,
          commission_rate: payout.commission_rate,
          transaction_id: txn,
          payment_method: "bank_transfer",
          notes: remark.trim() || undefined,
          order_ids: payout.order_ids,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || "Payout failed")
      }

      toast.success("Payout recorded successfully")
      setPayModalOpen(false)
      setSelectedVendor(null)
      setTransactionId("")
      setRemark("")
      await loadData()
    } catch (error: any) {
      console.error("Payout error:", error)
      toast.error(error.message || "Failed to process payout")
    } finally {
      setProcessingVendor(null)
    }
  }

  const selectedPayout = selectedVendor
    ? pendingPayouts[selectedVendor.id]
    : null

  if (loading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading vendors and payouts...</p>
        </div>
      </Container>
    )
  }

  return (
    <Container>
      <div className="mb-2 flex items-center justify-between">
        <Heading level="h1">Vendor Payouts</Heading>
        <Button variant="secondary" size="small" onClick={loadData}>
          Refresh
        </Button>
      </div>
      <p className="mb-6 text-sm text-ui-fg-subtle">
        Pay only <strong>Available</strong> balance (after the 5-minute post-delivery
        unlock). Unlocking amounts stay pending until the timer ends.{" "}
        <strong>Logistic fee</strong> applies for Easy Ship only (Self Ship = ₹0).
        Open <strong>Payable orders</strong> to see each product and pay amount.
      </p>

      {vendors.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">No approved vendors found</p>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Bank Details</Table.HeaderCell>
              <Table.HeaderCell>Payable orders</Table.HeaderCell>
              <Table.HeaderCell>Unlocking (5 min)</Table.HeaderCell>
              <Table.HeaderCell>Commission</Table.HeaderCell>
              <Table.HeaderCell>Logistic fee</Table.HeaderCell>
              <Table.HeaderCell>Available to pay</Table.HeaderCell>
              <Table.HeaderCell>Action</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {vendors.map((vendor) => {
              const payout = pendingPayouts[vendor.id]
              const hasPending = payout && payout.net_amount > 0
              const hasBankDetails =
                vendor.bank_name && vendor.account_no && vendor.ifsc_code
              const unlockingBal = payout?.unlocking_balance || 0
              const unlockingCount = payout?.unlocking_count || 0

              return (
                <Table.Row key={vendor.id}>
                  <Table.Cell>
                    <div>
                      <p className="font-medium">{vendor.name}</p>
                      <p className="text-xs text-gray-500">{vendor.email}</p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {hasBankDetails ? (
                      <div className="text-sm">
                        <p className="font-medium">{vendor.bank_name}</p>
                        <p className="text-xs text-gray-500">
                          {vendor.account_no} • {vendor.ifsc_code}
                        </p>
                      </div>
                    ) : (
                      <Badge color="red">Missing</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {payout ? (
                      <div data-payable-dropdown>
                        <PayableLinesDropdown
                          payout={payout}
                          open={expandedVendorId === vendor.id}
                          onToggle={() =>
                            setExpandedVendorId((current) =>
                              current === vendor.id ? null : vendor.id
                            )
                          }
                        />
                      </div>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {unlockingBal > 0 ? (
                      <div className="text-sm">
                        <span className="font-medium text-amber-600">
                          {formatCurrency(unlockingBal)}
                        </span>
                        <p className="text-xs text-gray-500">
                          {unlockingCount} order{unlockingCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-gray-400">₹0</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {payout ? (
                      <span className="text-sm">
                        {formatCurrency(payout.commission)}
                        <span className="ml-1 text-xs text-gray-500">
                          ({payout.commission_rate}%{" "}
                          {payout.commission_source === "custom"
                            ? "custom"
                            : "global"}
                          )
                        </span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {payout ? (
                      <div className="text-sm">
                        <span
                          className={
                            (payout.logistic_fee || 0) > 0
                              ? "font-medium text-red-600"
                              : "text-gray-400"
                          }
                        >
                          {(payout.logistic_fee || 0) > 0
                            ? `−${formatCurrency(payout.logistic_fee)}`
                            : "₹0"}
                        </span>
                        <p className="text-xs text-gray-500">Easy Ship only</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">₹0</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {payout && hasPending ? (
                      <span className="font-semibold text-green-600">
                        {formatCurrency(payout.net_amount)}
                      </span>
                    ) : (
                      <span className="text-gray-400">₹0</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => openPayModal(vendor)}
                      disabled={
                        !hasPending ||
                        !hasBankDetails ||
                        processingVendor === vendor.id
                      }
                      isLoading={processingVendor === vendor.id}
                    >
                      {processingVendor === vendor.id ? "Processing..." : "Pay Now"}
                    </Button>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}

      {payModalOpen && selectedVendor && selectedPayout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePayModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-ui-border-base px-5 py-4">
              <Heading level="h2">Confirm payout</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Review products and amounts, then add transaction ID and remark.
              </Text>
            </div>

            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="space-y-2 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Vendor</span>
                  <span className="text-right font-medium">
                    {selectedPayout.vendor_name || selectedVendor.name}
                    <br />
                    <span className="text-xs font-normal text-ui-fg-muted">
                      {selectedVendor.email}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Bank</span>
                  <span className="text-right">
                    {selectedVendor.bank_name}
                    <br />
                    <span className="text-xs text-ui-fg-muted">
                      {selectedVendor.account_no} • {selectedVendor.ifsc_code}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Payable orders</span>
                  <span>{selectedPayout.order_count}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Total revenue</span>
                  <span>{formatCurrency(selectedPayout.total_revenue)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">
                    Commission ({selectedPayout.commission_rate}%{" "}
                    {selectedPayout.commission_source === "custom"
                      ? "custom"
                      : "global"}
                    )
                  </span>
                  <span>-{formatCurrency(selectedPayout.commission)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Logistic fee (Easy Ship)</span>
                  <span>
                    {(selectedPayout.logistic_fee || 0) > 0
                      ? `-${formatCurrency(selectedPayout.logistic_fee)}`
                      : "₹0"}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-ui-border-base pt-2">
                  <span className="font-medium">Amount to pay</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(selectedPayout.net_amount)}
                  </span>
                </div>
              </div>

              {(selectedPayout.line_items?.length || 0) > 0 ? (
                <div className="overflow-hidden rounded-md border border-ui-border-base">
                  <div className="border-b border-ui-border-base bg-ui-bg-subtle px-3 py-2">
                    <Text size="small" weight="plus">
                      Products in this payout
                    </Text>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-ui-border-base text-xs text-ui-fg-muted">
                          <th className="px-3 py-2 font-medium">Product</th>
                          <th className="px-3 py-2 font-medium">Order</th>
                          <th className="px-3 py-2 text-right font-medium">Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPayout.line_items.map((line) => (
                          <tr
                            key={line.id}
                            className="border-b border-ui-border-base/60 last:border-0"
                          >
                            <td className="max-w-[11rem] truncate px-3 py-2 font-medium">
                              {line.product_name}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-ui-fg-subtle">
                              {line.type === "claim"
                                ? "Claim"
                                : `#${line.order_display_id || line.order_id.slice(0, 8)}`}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-green-600">
                              {formatCurrency(line.pay_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="payout-txn-id">Transaction ID</Label>
                <Input
                  id="payout-txn-id"
                  placeholder="e.g. UTR / bank reference number"
                  value={transactionId}
                  disabled={!!processingVendor}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="payout-remark">Remark</Label>
                <Textarea
                  id="payout-remark"
                  placeholder="Optional note from admin"
                  value={remark}
                  disabled={!!processingVendor}
                  rows={3}
                  onChange={(e) => setRemark(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-ui-border-base px-5 py-4">
              <Button
                variant="secondary"
                onClick={closePayModal}
                disabled={!!processingVendor}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmPay()}
                disabled={!!processingVendor || !transactionId.trim()}
                isLoading={!!processingVendor}
              >
                {processingVendor ? "Saving…" : "Confirm payout"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Payouts",
  icon: CurrencyDollar,
})

export default VendorPayoutsPage
