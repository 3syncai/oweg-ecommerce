import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
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

type PendingPayout = {
  vendor_id: string
  vendor_name: string
  total_revenue: number
  commission: number
  net_amount: number
  commission_rate: number
  commission_source?: "global" | "custom"
  order_count: number
  order_ids: string[]
  unlocking_balance?: number
  unlocking_count?: number
}

const VendorPayoutsPage = () => {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [pendingPayouts, setPendingPayouts] = useState<Record<string, PendingPayout>>({})
  const [loading, setLoading] = useState(true)
  const [processingVendor, setProcessingVendor] = useState<string | null>(null)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [transactionId, setTransactionId] = useState("")
  const [remark, setRemark] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

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
            net_amount: result.data.net_amount || 0,
            commission_rate: result.data.commission_rate || 0,
            commission_source: result.data.commission_source,
            order_count: result.data.order_count || 0,
            order_ids: result.data.order_ids || [],
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(amount)
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
      <div className="flex items-center justify-between mb-2">
        <Heading level="h1">Vendor Payouts</Heading>
        <Button variant="secondary" size="small" onClick={loadData}>
          Refresh
        </Button>
      </div>
      <p className="text-sm text-ui-fg-subtle mb-6">
        Pay only <strong>Available</strong> balance (after the 5-minute post-delivery
        unlock). Unlocking amounts stay pending until the timer ends.
      </p>

      {vendors.length === 0 ? (
        <div className="text-center py-12">
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
                      <Badge color="blue">{payout.order_count}</Badge>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {unlockingBal > 0 ? (
                      <div className="text-sm">
                        <span className="text-amber-600 font-medium">
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
                        <span className="text-xs text-gray-500 ml-1">
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
            className="w-full max-w-lg rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-ui-border-base px-5 py-4">
              <Heading level="h2">Confirm payout</Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Review details, then add transaction ID and remark.
              </Text>
            </div>

            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="text-ui-fg-subtle">Vendor</span>
                  <span className="font-medium text-right">
                    {selectedPayout.vendor_name || selectedVendor.name}
                    <br />
                    <span className="text-xs text-ui-fg-muted font-normal">
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
                <div className="flex justify-between gap-3 border-t border-ui-border-base pt-2">
                  <span className="font-medium">Amount to pay</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(selectedPayout.net_amount)}
                  </span>
                </div>
              </div>

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
