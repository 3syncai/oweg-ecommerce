import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Badge, Button, toast } from "@medusajs/ui"
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
                    <Badge color="orange">Not Found</Badge>
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

    return (
        <Container className="p-4">
            <div className="flex items-center justify-between mb-3">
                <Heading level="h2">Brand Authorization</Heading>
                <Badge color={auth.verified ? "green" : "orange"}>
                    {auth.verified ? "✓ Verified" : "Pending Verification"}
                </Badge>
            </div>

            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Brand:</span>
                    <span className="font-medium">{auth.brand_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Uploaded:</span>
                    <span className="font-medium">{uploadDate}</span>
                </div>
                {auth.verified && auth.verified_at && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Verified:</span>
                        <span className="font-medium">
                            {new Date(auth.verified_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            })}
                        </span>
                    </div>
                )}
                {auth.metadata?.original_filename && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">File:</span>
                        <span className="font-medium truncate ml-2" title={auth.metadata.original_filename}>
                            {auth.metadata.original_filename}
                        </span>
                    </div>
                )}
            </div>

            <Button
                variant="secondary"
                onClick={handleViewDocument}
                className="w-full mb-2"
            >
                📄 View Authorization Document
            </Button>

            {!auth.verified && (
                <Button
                    variant="primary"
                    onClick={handleApprove}
                    className="w-full mb-2"
                >
                    ✓ Approve Authorization
                </Button>
            )}

            <p className="text-xs text-gray-500 mt-2 text-center">
                Secure link expires in 1 hour
            </p>
        </Container>
    )
}

export const config = defineWidgetConfig({
    zone: "product.details.side.after",
})

export default ProductBrandAuthorizationWidget
