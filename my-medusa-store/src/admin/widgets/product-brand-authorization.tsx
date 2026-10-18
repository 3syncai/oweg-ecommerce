import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, StatusBadge, Button, toast } from "@medusajs/ui"
import { Check, DocumentText, LockClosedSolid, XMark } from "@medusajs/icons"
import { useEffect, useState } from "react"

type BrandAuthorization = {
    has_authorization: boolean
    brand_name?: string
    message?: string
    authorization?: {
        id: string
        brand_name: string
        file_url: string
        signed_url: string
        uploaded_at: string
        verified: boolean
        verified_at: string | null
        vendor_id: string
        metadata: any
    }
}

const ProductBrandAuthorizationWidget = ({ data }: { data: { id: string } }) => {
    const [authorization, setAuthorization] = useState<BrandAuthorization | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchBrandAuthorization()
    }, [data.id])

    const fetchBrandAuthorization = async () => {
        try {
            const response = await fetch(
                `/admin/products/${data.id}/brand-authorization`,
                {
                    credentials: "include",
                }
            )
            const authData = await response.json()
            setAuthorization(authData)
        } catch (error) {
            console.error("Failed to fetch brand authorization:", error)
            toast.error("Error", {
                description: "Failed to load brand authorization"
            })
        } finally {
            setLoading(false)
        }
    }

    const handleViewDocument = () => {
        if (authorization?.authorization?.signed_url) {
            window.open(authorization.authorization.signed_url, '_blank')
        }
    }

    const handleApprove = async () => {
        if (!authorization?.authorization?.id) return

        if (!confirm(`Are you sure you want to approve the brand authorization for "${authorization.authorization.brand_name}"?`)) {
            return
        }

        try {
            const response = await fetch(
                `/admin/brand-authorizations/${authorization.authorization.id}/verify`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        verified_by: "admin" // You can get actual admin user ID if available
                    })
                }
            )

            if (response.ok) {
                toast.success("Success", {
                    description: "Brand authorization approved successfully"
                })
                // Refresh the authorization data
                fetchBrandAuthorization()
            } else {
                throw new Error("Failed to approve authorization")
            }
        } catch (error) {
            console.error("Failed to approve authorization:", error)
            toast.error("Error", {
                description: "Failed to approve brand authorization"
            })
        }
    }

    const handleReject = async () => {
        if (!authorization?.authorization?.id) return

        const reason = prompt(
            `Why is the authorization letter for "${authorization.authorization.brand_name}" being rejected?`
        )
        if (reason === null) return

        try {
            const response = await fetch(
                `/admin/brand-authorizations/${authorization.authorization.id}/reject`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rejected_by: "admin", reason }),
                }
            )
            if (!response.ok) throw new Error("Failed to reject authorization")

            toast.success("Authorization rejected", {
                description: "The vendor can upload a new letter for review.",
            })
            fetchBrandAuthorization()
        } catch (error) {
            console.error("Failed to reject brand authorization:", error)
            toast.error("Error", { description: "Failed to reject brand authorization" })
        }
    }

    if (loading) {
        return (
            <Container className="p-4">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    <span className="text-sm text-gray-500">Loading authorization...</span>
                </div>
            </Container>
        )
    }

    if (!authorization?.has_authorization) {
        return (
            <Container className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <Heading level="h2">Brand Authorization</Heading>
                    <StatusBadge color="orange">Not Found</StatusBadge>
                </div>
                <p className="text-sm text-gray-600">
                    {authorization?.message || "No brand authorization on file"}
                </p>
                {authorization?.brand_name && (
                    <p className="text-sm text-gray-500 mt-1">
                        Brand: <strong>{authorization.brand_name}</strong>
                    </p>
                )}
            </Container>
        )
    }

    const auth = authorization.authorization!
    const uploadDate = new Date(auth.uploaded_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })

    const statusBadgeColor = auth.verified
        ? "green"
        : auth.metadata?.review_status === "rejected"
            ? "red"
            : "orange"
    const statusText = auth.verified
        ? "Approved"
        : auth.metadata?.review_status === "rejected"
            ? "Rejected"
            : "Pending Review"

    return (
        <Container className="p-4">
            <div className="flex items-center justify-between mb-3">
                <Heading level="h2">Brand Authorization</Heading>
                <StatusBadge color={statusBadgeColor}>
                    {statusText}
                </StatusBadge>
            </div>

            <div className="space-y-2.5 mb-4">
                <div className="flex justify-between text-sm items-center">
                    <span className="text-ui-fg-subtle">Brand:</span>
                    <span className="font-medium text-ui-fg-base">{auth.brand_name}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                    <span className="text-ui-fg-subtle">Uploaded:</span>
                    <span className="font-medium text-ui-fg-base">{uploadDate}</span>
                </div>
                {auth.verified && auth.verified_at && (
                    <div className="flex justify-between text-sm items-center">
                        <span className="text-ui-fg-subtle">Verified:</span>
                        <span className="font-medium text-ui-fg-base">
                            {new Date(auth.verified_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            })}
                        </span>
                    </div>
                )}
                {auth.metadata?.review_status === "rejected" && auth.metadata?.rejection_reason && (
                    <div className="text-sm bg-rose-500/10 p-2 rounded border border-rose-500/20">
                        <span className="text-rose-700 font-medium">Rejection reason: </span>
                        <span className="text-rose-600">{auth.metadata.rejection_reason}</span>
                    </div>
                )}
                {auth.metadata?.original_filename && (
                    <div className="flex justify-between text-sm items-center gap-2">
                        <span className="text-ui-fg-subtle">File:</span>
                        <span className="font-mono text-xs text-ui-fg-subtle truncate max-w-[180px] bg-ui-bg-subtle px-1.5 py-0.5 rounded border border-ui-border-base" title={auth.metadata.original_filename}>
                            {auth.metadata.original_filename}
                        </span>
                    </div>
                )}
            </div>

            <Button
                variant="secondary"
                onClick={handleViewDocument}
                className="w-full mb-2.5 justify-center"
            >
                <DocumentText className="w-4 h-4 mr-1.5 text-ui-fg-subtle" />
                View Authorization Document
            </Button>

            {!auth.verified && auth.metadata?.review_status !== "rejected" && (
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="primary" onClick={handleApprove} className="justify-center">
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Approve
                    </Button>
                    <Button variant="danger" onClick={handleReject} className="justify-center">
                        <XMark className="w-3.5 h-3.5 mr-1" />
                        Reject
                    </Button>
                </div>
            )}

            <p className="text-xs text-ui-fg-muted mt-2.5 text-center flex items-center justify-center gap-1">
                <LockClosedSolid className="w-3 h-3 text-ui-fg-muted" />
                <span>Secure link expires in 1 hour</span>
            </p>
        </Container>
    )
}

export const config = defineWidgetConfig({
    zone: "product.details.side.after",
})

export default ProductBrandAuthorizationWidget
