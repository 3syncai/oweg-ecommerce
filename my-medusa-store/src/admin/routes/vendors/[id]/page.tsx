"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge, Avatar } from "@medusajs/ui"
import {
    CheckCircleSolid,
    XCircleSolid,
    ClockSolid,
    BuildingsSolid,
    User,
    DocumentTextSolid,
    CreditCardSolid,
    ShoppingBag,
    ArrowLeftMini,
    CurrencyDollar
} from "@medusajs/icons"

type Payout = {
    id: string
    amount: number
    commission_amount: number
    net_amount: number
    commission_rate: number
    transaction_id: string
    payment_method: string
    status: string
    notes?: string
    order_ids?: string[]
    created_at: string
}

type PayoutCalculation = {
    vendor_id: string
    vendor_name: string
    commission_rate: number
    gross_amount: number
    commission_amount: number
    net_amount: number
    order_count: number
    orders: any[]
}

type BrandAuthorization = {
    id: string
    brand_name: string
    file_url: string
    signed_url: string
    verified: boolean
    verified_at: string | null
    verified_by: string | null
    created_at: string
    updated_at: string
    metadata: any
}

type VendorDocument = {
    key: string
    url: string
    signed_url?: string
    name?: string
    type?: string
}

type VendorProduct = {
    id: string
    title: string
    status: string
    approval_status?: string | null
    created_at: string
    thumbnail?: string | null
}

type Vendor = {
    id: string
    name: string
    first_name?: string | null
    last_name?: string | null
    email: string
    phone?: string | null
    telephone?: string | null
    store_name?: string | null
    store_phone?: string | null
    store_address?: string | null
    store_country?: string | null
    store_region?: string | null
    store_city?: string | null
    store_pincode?: string | null
    store_logo?: string | null
    store_banner?: string | null
    shipping_policy?: string | null
    return_policy?: string | null
    whatsapp_number?: string | null
    pan_gst?: string | null
    gst_no?: string | null
    pan_no?: string | null
    bank_name?: string | null
    account_no?: string | null
    ifsc_code?: string | null
    cancel_cheque_url?: string | null
    cancel_cheque_signed_url?: string | null
    commission_rate?: number
    documents?: VendorDocument[]
    is_approved: boolean
    approved_at?: string | null
    approved_by?: string | null
    rejected_at?: string | null
    rejected_by?: string | null
    rejection_reason?: string | null
    created_at: string
    status: "approved" | "rejected" | "pending"
    product_count: number
    products: VendorProduct[]
    brand_authorizations: BrandAuthorization[]
}

type TabType = "overview" | "documents" | "brands" | "banking" | "products" | "payouts"

const VendorDetailPage = () => {
    const [loading, setLoading] = useState(true)
    const [vendor, setVendor] = useState<Vendor | null>(null)
    const [activeTab, setActiveTab] = useState<TabType>("overview")
    const [vendorId, setVendorId] = useState<string>("")

    // Payout state
    const [payouts, setPayouts] = useState<Payout[]>([])
    const [payoutLoading, setPayoutLoading] = useState(false)
    const [showPayoutModal, setShowPayoutModal] = useState(false)
    const [calculation, setCalculation] = useState<PayoutCalculation | null>(null)
    const [transactionId, setTransactionId] = useState("")
    const [payoutNotes, setPayoutNotes] = useState("")

    useEffect(() => {
        // Extract vendor ID from URL path
        const pathParts = window.location.pathname.split('/')
        const id = pathParts[pathParts.length - 1]
        setVendorId(id)
    }, [])

    useEffect(() => {
        if (vendorId) {
            loadVendorDetails()
        }
    }, [vendorId])

    const loadVendorDetails = async () => {
        setLoading(true)
        try {
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/admin/vendors/${vendorId}`, {
                credentials: "include",
            })

            if (response.ok) {
                const data = await response.json()
                setVendor(data.vendor)
            } else {
                console.error("Failed to fetch vendor details")
            }
        } catch (error) {
            console.error("Failed to fetch vendor details:", error)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return "-"
        try {
            return new Date(dateString).toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            })
        } catch {
            return dateString
        }
    }

    const handleApproveAuthorization = async (authId: string, brandName: string) => {
        if (!confirm(`Are you sure you want to approve the brand authorization for "${brandName}"?`)) {
            return
        }

        try {
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/admin/brand-authorizations/${authId}/verify`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    verified_by: "admin"
                })
            })

            if (response.ok) {
                alert("Brand authorization approved successfully!")
                // Refresh vendor data
                loadVendorDetails()
            } else {
                throw new Error("Failed to approve")
            }
        } catch (error) {
            console.error("Failed to approve authorization:", error)
            alert("Failed to approve brand authorization")
        }
    }

    const loadPayouts = async () => {
        if (!vendorId) return

        setPayoutLoading(true)
        try {
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/admin/vendor-payouts?vendor_id=${vendorId}`, {
                credentials: "include",
            })

            if (response.ok) {
                const data = await response.json()
                setPayouts(data.payouts || [])
            }
        } catch (error) {
            console.error("Failed to fetch payouts:", error)
        } finally {
            setPayoutLoading(false)
        }
    }

    const handleCalculatePayout = async () => {
        if (!vendorId) return

        setPayoutLoading(true)
        try {
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/admin/vendor-payouts/calculate`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vendor_id: vendorId }),
            })

            if (response.ok) {
                const data = await response.json()
                setCalculation(data.calculation)
                setShowPayoutModal(true)
            } else {
                alert("Failed to calculate payout")
            }
        } catch (error) {
            console.error("Failed to calculate payout:", error)
            alert("Failed to calculate payout")
        } finally {
            setPayoutLoading(false)
        }
    }

    const handleCreatePayout = async () => {
        if (!calculation || !transactionId) {
            alert("Please enter a transaction ID")
            return
        }

        setPayoutLoading(true)
        try {
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/admin/vendor-payouts`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vendor_id: calculation.vendor_id,
                    amount: calculation.gross_amount,
                    commission_amount: calculation.commission_amount,
                    net_amount: calculation.net_amount,
                    commission_rate: calculation.commission_rate,
                    transaction_id: transactionId,
                    notes: payoutNotes || undefined,
                    order_ids: calculation.orders.map((o: any) => o.id),
                }),
            })

            if (response.ok) {
                alert("Payout created successfully!")
                setShowPayoutModal(false)
                setTransactionId("")
                setPayoutNotes("")
                setCalculation(null)
                loadPayouts() // Reload payouts
            } else {
                alert("Failed to create payout")
            }
        } catch (error) {
            console.error("Failed to create payout:", error)
            alert("Failed to create payout")
        } finally {
            setPayoutLoading(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
        }).format(amount)
    }

    const getStatusBadge = (status: string) => {
        if (status === "approved") {
            return (
                <Badge color="green" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircleSolid style={{ width: 12, height: 12 }} />
                    Approved
                </Badge>
            )
        } else if (status === "rejected") {
            return (
                <Badge color="red" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <XCircleSolid style={{ width: 12, height: 12 }} />
                    Rejected
                </Badge>
            )
        } else {
            return (
                <Badge color="orange" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <ClockSolid style={{ width: 12, height: 12 }} />
                    Pending
                </Badge>
            )
        }
    }

    const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border-base)" }}>
            <Text size="small" style={{ color: "var(--fg-muted)" }}>{label}</Text>
            <Text size="small" weight="plus">{value || "-"}</Text>
        </div>
    )

    const InfoCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: 8,
            padding: 20,
        }}>
            <Heading level="h3" style={{ marginBottom: 16, fontSize: 16 }}>{title}</Heading>
            {children}
        </div>
    )

    if (loading) {
        return (
            <Container style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    <Text>Loading vendor details...</Text>
                </div>
            </Container>
        )
    }

    if (!vendor) {
        return (
            <Container style={{ padding: 24 }}>
                <Text>Vendor not found</Text>
            </Container>
        )
    }

    return (
        <Container style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Button
                    variant="transparent"
                    onClick={() => window.history.back()}
                    style={{ marginBottom: 16, padding: 0 }}
                >
                    <ArrowLeftMini style={{ marginRight: 8 }} />
                    Back to Vendors
                </Button>

                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
                    <Avatar
                        src={vendor.store_logo || undefined}
                        fallback={vendor.store_name?.[0] || vendor.name[0]}
                        style={{ width: 64, height: 64 }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                            <Heading level="h1">{vendor.store_name || vendor.name}</Heading>
                            {getStatusBadge(vendor.status)}
                        </div>
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>
                            {vendor.email}
                        </Text>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>Products</Text>
                        <Heading level="h2" style={{ fontSize: 24 }}>{vendor.product_count}</Heading>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{
                display: "flex",
                gap: 8,
                marginBottom: 24,
                borderBottom: "1px solid var(--border-base)",
                paddingBottom: 8,
            }}>
                {[
                    { id: "overview" as TabType, label: "Overview", icon: User },
                    { id: "documents" as TabType, label: "Documents", icon: DocumentTextSolid },
                    { id: "brands" as TabType, label: "Brand Authorizations", icon: BuildingsSolid },
                    { id: "banking" as TabType, label: "Banking", icon: CreditCardSolid },
                    { id: "products" as TabType, label: "Products", icon: ShoppingBag },
                    { id: "payouts" as TabType, label: "Payouts", icon: CurrencyDollar },
                ].map((tab) => (
                    <Button
                        key={tab.id}
                        variant={activeTab === tab.id ? "primary" : "transparent"}
                        onClick={() => {
                            setActiveTab(tab.id)
                            if (tab.id === "payouts") {
                                loadPayouts()
                            }
                        }}
                        style={{ gap: 8 }}
                    >
                        <tab.icon style={{ width: 16, height: 16 }} />
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 20 }}>
                    <InfoCard title="Personal Information">
                        <InfoRow label="Full Name" value={`${vendor.first_name || ""} ${vendor.last_name || ""}`.trim() || vendor.name} />
                        <InfoRow label="Email" value={vendor.email} />
                        <InfoRow label="Phone" value={vendor.phone} />
                        <InfoRow label="Telephone" value={vendor.telephone} />
                        <InfoRow label="WhatsApp" value={vendor.whatsapp_number} />
                    </InfoCard>

                    <InfoCard title="Store Information">
                        <InfoRow label="Store Name" value={vendor.store_name} />
                        <InfoRow label="Store Phone" value={vendor.store_phone} />
                        <InfoRow label="Address" value={vendor.store_address} />
                        <InfoRow label="City" value={vendor.store_city} />
                        <InfoRow label="Region" value={vendor.store_region} />
                        <InfoRow label="Country" value={vendor.store_country} />
                        <InfoRow label="Pincode" value={vendor.store_pincode} />
                    </InfoCard>

                    <InfoCard title="Tax Information">
                        <InfoRow label="GST Number" value={vendor.gst_no || vendor.pan_gst} />
                        <InfoRow label="PAN Number" value={vendor.pan_no || vendor.pan_gst} />
                    </InfoCard>

                    <InfoCard title="Status Information">
                        <InfoRow label="Status" value={vendor.status} />
                        <InfoRow label="Registered On" value={formatDate(vendor.created_at)} />
                        {vendor.status === "approved" && (
                            <>
                                <InfoRow label="Approved On" value={formatDate(vendor.approved_at)} />
                                <InfoRow label="Approved By" value={vendor.approved_by} />
                            </>
                        )}
                        {vendor.status === "rejected" && (
                            <>
                                <InfoRow label="Rejected On" value={formatDate(vendor.rejected_at)} />
                                <InfoRow label="Rejected By" value={vendor.rejected_by} />
                                {vendor.rejection_reason && (
                                    <div style={{ padding: "12px 0" }}>
                                        <Text size="small" style={{ color: "var(--fg-destructive)", display: "block", marginBottom: 4 }}>
                                            Rejection Reason:
                                        </Text>
                                        <Text size="small">{vendor.rejection_reason}</Text>
                                    </div>
                                )}
                            </>
                        )}
                    </InfoCard>
                </div>
            )}

            {activeTab === "documents" && (
                <div>
                    {vendor.documents && vendor.documents.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                            {vendor.documents.map((doc, index) => (
                                <div
                                    key={index}
                                    style={{
                                        background: "var(--bg-base)",
                                        border: "1px solid var(--border-base)",
                                        borderRadius: 8,
                                        padding: 16,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 12,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <DocumentTextSolid style={{ width: 20, height: 20, color: "var(--fg-muted)" }} />
                                        <Text weight="plus" style={{ flex: 1, wordBreak: "break-word" }}>
                                            {doc.name || `Document ${index + 1}`}
                                        </Text>
                                    </div>
                                    {doc.type && (
                                        <Badge color="grey" size="small">{doc.type}</Badge>
                                    )}
                                    <Button
                                        variant="secondary"
                                        size="small"
                                        onClick={() => window.open(doc.signed_url || doc.url, '_blank')}
                                    >
                                        View Document
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: 48 }}>
                            <DocumentTextSolid style={{ width: 48, height: 48, margin: "0 auto 16px", color: "var(--fg-muted)" }} />
                            <Text style={{ color: "var(--fg-muted)" }}>No documents uploaded</Text>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "brands" && (
                <div>
                    {vendor.brand_authorizations && vendor.brand_authorizations.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                            {vendor.brand_authorizations.map((auth) => (
                                <div
                                    key={auth.id}
                                    style={{
                                        background: "var(--bg-base)",
                                        border: "1px solid var(--border-base)",
                                        borderRadius: 8,
                                        padding: 20,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                        <Heading level="h3" style={{ fontSize: 18, textTransform: "capitalize" }}>
                                            {auth.brand_name}
                                        </Heading>
                                        <Badge color={auth.verified ? "green" : "orange"}>
                                            {auth.verified ? "✓ Verified" : "Pending"}
                                        </Badge>
                                    </div>

                                    <div style={{ marginBottom: 16 }}>
                                        <InfoRow label="Uploaded" value={formatDate(auth.created_at)} />
                                        {auth.verified && auth.verified_at && (
                                            <InfoRow label="Verified" value={formatDate(auth.verified_at)} />
                                        )}
                                        {auth.verified && auth.verified_by && (
                                            <InfoRow label="Verified By" value={auth.verified_by} />
                                        )}
                                    </div>

                                    <Button
                                        variant="secondary"
                                        onClick={() => window.open(auth.signed_url, '_blank')}
                                        style={{ width: "100%", marginBottom: 8 }}
                                    >
                                        📄 View Authorization Letter
                                    </Button>

                                    {!auth.verified && (
                                        <Button
                                            variant="primary"
                                            onClick={() => handleApproveAuthorization(auth.id, auth.brand_name)}
                                            style={{ width: "100%" }}
                                        >
                                            ✓ Approve Authorization
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: 48 }}>
                            <BuildingsSolid style={{ width: 48, height: 48, margin: "0 auto 16px", color: "var(--fg-muted)" }} />
                            <Text style={{ color: "var(--fg-muted)" }}>No brand authorizations uploaded</Text>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "banking" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 20 }}>
                    <InfoCard title="Bank Account Details">
                        <InfoRow label="Bank Name" value={vendor.bank_name} />
                        <InfoRow label="Account Number" value={vendor.account_no} />
                        <InfoRow label="IFSC Code" value={vendor.ifsc_code} />
                    </InfoCard>

                    {vendor.cancel_cheque_url && (
                        <InfoCard title="Cancelled Cheque">
                            <div style={{ textAlign: "center", padding: 16 }}>
                                <DocumentTextSolid style={{ width: 48, height: 48, margin: "0 auto 16px", color: "var(--fg-muted)" }} />
                                <Button
                                    variant="secondary"
                                    onClick={() => window.open((vendor.cancel_cheque_signed_url || vendor.cancel_cheque_url || ''), '_blank')}
                                >
                                    View Cancelled Cheque
                                </Button>
                            </div>
                        </InfoCard>
                    )}
                </div>
            )}

            {activeTab === "products" && (
                <div>
                    {vendor.products && vendor.products.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {vendor.products.map((product) => (
                                <div
                                    key={product.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 16,
                                        padding: 16,
                                        background: "var(--bg-base)",
                                        border: "1px solid var(--border-base)",
                                        borderRadius: 8,
                                    }}
                                >
                                    {product.thumbnail && (
                                        <img
                                            src={product.thumbnail}
                                            alt={product.title}
                                            style={{
                                                width: 64,
                                                height: 64,
                                                objectFit: "cover",
                                                borderRadius: 6,
                                            }}
                                        />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <Text weight="plus" style={{ marginBottom: 4 }}>{product.title}</Text>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <Badge color="grey" size="small">{product.status}</Badge>
                                            {product.approval_status && (
                                                <Badge
                                                    color={
                                                        product.approval_status === "approved"
                                                            ? "green"
                                                            : product.approval_status === "rejected"
                                                                ? "red"
                                                                : "orange"
                                                    }
                                                    size="small"
                                                >
                                                    {product.approval_status}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="small"
                                        onClick={() => window.open(`/app/products/${product.id}`, "_blank")}
                                    >
                                        View Product
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: 48 }}>
                            <ShoppingBag style={{ width: 48, height: 48, margin: "0 auto 16px", color: "var(--fg-muted)" }} />
                            <Text style={{ color: "var(--fg-muted)" }}>No products listed yet</Text>
                        </div>
                    )}
                </div>
            )}

            {/* Payouts Tab */}
            {activeTab === "payouts" && (
                <div>
                    {/* Bank Details & Summary */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 20, marginBottom: 24 }}>
                        <InfoCard title="Vendor Bank Details">
                            <InfoRow label="Bank Name" value={vendor.bank_name} />
                            <InfoRow label="Account Number" value={vendor.account_no} />
                            <InfoRow label="IFSC Code" value={vendor.ifsc_code} />
                            <InfoRow label="Commission Rate" value={`${vendor.commission_rate || 2}%`} />
                        </InfoCard>
                    </div>

                    {/* Action Button */}
                    <div style={{ marginBottom: 24 }}>
                        <Button
                            variant="primary"
                            onClick={handleCalculatePayout}
                            disabled={payoutLoading}
                        >
                            <CurrencyDollar />
                            {payoutLoading ? "Calculating..." : "Calculate & Pay Now"}
                        </Button>
                    </div>

                    {/* Payout History */}
                    <div style={{ marginTop: 24 }}>
                        <Heading level="h2" style={{ marginBottom: 16 }}>Payout History</Heading>
                        {payouts.length > 0 ? (
                            <div style={{ border: "1px solid var(--border-base)", borderRadius: 8, overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead style={{ background: "var(--bg-subtle)", borderBottom: "1px solid var(--border-base)" }}>
                                        <tr>
                                            <th style={{ padding: "12px 16px", textAlign: "left" }}><Text size="small" weight="plus">Date</Text></th>
                                            <th style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small" weight="plus">Gross Amount</Text></th>
                                            <th style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small" weight="plus">Commission</Text></th>
                                            <th style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small" weight="plus">Net Paid</Text></th>
                                            <th style={{ padding: "12px 16px", textAlign: "left" }}><Text size="small" weight="plus">Transaction ID</Text></th>
                                            <th style={{ padding: "12px 16px", textAlign: "left" }}><Text size="small" weight="plus">Status</Text></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payouts.map((payout) => (
                                            <tr key={payout.id} style={{ borderBottom: "1px solid var(--border-base)" }}>
                                                <td style={{ padding: "12px 16px" }}><Text size="small">{formatDate(payout.created_at)}</Text></td>
                                                <td style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small">{formatCurrency(payout.amount)}</Text></td>
                                                <td style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small" style={{ color: "var(--fg-muted)" }}>{formatCurrency(payout.commission_amount)}</Text></td>
                                                <td style={{ padding: "12px 16px", textAlign: "right" }}><Text size="small" weight="plus">{formatCurrency(payout.net_amount)}</Text></td>
                                                <td style={{ padding: "12px 16px" }}><Text size="small">{payout.transaction_id}</Text></td>
                                                <td style={{ padding: "12px 16px" }}>
                                                    <Badge color={payout.status === "processed" ? "green" : "orange"}>
                                                        {payout.status}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", padding: 48, border: "1px solid var(--border-base)", borderRadius: 8 }}>
                                <Text style={{ color: "var(--fg-muted)" }}>No payouts yet</Text>
                            </div>
                        )}
                    </div>

                    {/* Payment Modal */}
                    {showPayoutModal && calculation && (
                        <div style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: "rgba(0, 0, 0, 0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 9999,
                        }}>
                            <div style={{
                                background: "var(--bg-base)",
                                borderRadius: 12,
                                padding: 24,
                                maxWidth: 600,
                                width: "90%",
                                maxHeight: "90vh",
                                overflowY: "auto",
                            }}>
                                <Heading level="h2" style={{ marginBottom: 16 }}>Create Payout</Heading>

                                {/* Summary */}
                                <div style={{ marginBottom: 24, padding: 16, background: "var(--bg-subtle)", borderRadius: 8 }}>
                                    <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 8 }}>Payout Summary</Text>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text>Orders (7+ days old):</Text>
                                        <Text weight="plus">{calculation.order_count}</Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text>Gross Amount:</Text>
                                        <Text>{formatCurrency(calculation.gross_amount)}</Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text>Commission ({calculation.commission_rate}%):</Text>
                                        <Text style={{ color: "var(--fg-muted)" }}>-{formatCurrency(calculation.commission_amount)}</Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border-base)" }}>
                                        <Text weight="plus">Net Payout:</Text>
                                        <Text weight="plus" style={{ color: "var(--fg-success)", fontSize: 18 }}>{formatCurrency(calculation.net_amount)}</Text>
                                    </div>
                                </div>

                                {/* Bank Details */}
                                <div style={{ marginBottom: 24, padding: 16, background: "var(--bg-field)", borderRadius: 8 }}>
                                    <Text size="small" weight="plus" style={{ marginBottom: 8 }}>Bank Details</Text>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text size="small" style={{ color: "var(--fg-muted)" }}>Bank:</Text>
                                        <Text size="small">{vendor.bank_name}</Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text size="small" style={{ color: "var(--fg-muted)" }}>Account:</Text>
                                        <Text size="small">{vendor.account_no}</Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <Text size="small" style={{ color: "var(--fg-muted)" }}>IFSC:</Text>
                                        <Text size="small">{vendor.ifsc_code}</Text>
                                    </div>
                                </div>

                                {/* Transaction ID Input */}
                                <div style={{ marginBottom: 16 }}>
                                    <Text size="small" weight="plus" style={{ marginBottom: 8 }}>Transaction ID *</Text>
                                    <input
                                        type="text"
                                        value={transactionId}
                                        onChange={(e) => setTransactionId(e.target.value)}
                                        placeholder="Enter bank transaction ID"
                                        style={{
                                            width: "100%",
                                            padding: "8px 12px",
                                            border: "1px solid var(--border-base)",
                                            borderRadius: 6,
                                            background: "var(--bg-field)",
                                            color: "var(--fg-base)",
                                        }}
                                    />
                                </div>

                                {/* Notes Input */}
                                <div style={{ marginBottom: 24 }}>
                                    <Text size="small" weight="plus" style={{ marginBottom: 8 }}>Notes (Optional)</Text>
                                    <textarea
                                        value={payoutNotes}
                                        onChange={(e) => setPayoutNotes(e.target.value)}
                                        placeholder="Add any additional notes"
                                        rows={3}
                                        style={{
                                            width: "100%",
                                            padding: "8px 12px",
                                            border: "1px solid var(--border-base)",
                                            borderRadius: 6,
                                            background: "var(--bg-field)",
                                            color: "var(--fg-base)",
                                            resize: "vertical",
                                        }}
                                    />
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setShowPayoutModal(false)
                                            setTransactionId("")
                                            setPayoutNotes("")
                                        }}
                                        disabled={payoutLoading}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={handleCreatePayout}
                                        disabled={payoutLoading || !transactionId}
                                    >
                                        {payoutLoading ? "Processing..." : "Confirm Payment"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Container>
    )
}

export const config = defineRouteConfig({
    label: "Vendor Details",
})

export default VendorDetailPage
