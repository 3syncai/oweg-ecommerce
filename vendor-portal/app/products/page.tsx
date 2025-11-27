"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Table, Button } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorProductsApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Product = {
  id: string
  title: string
  status: string
  created_at: string
  thumbnail?: string
  handle?: string
  metadata?: {
    approval_status?: string
    vendor_id?: string
  }
}

// Status indicator component matching admin panel style
const StatusIndicator = ({ status }: { status: string }) => {
  const getStatusConfig = () => {
    const lowerStatus = status.toLowerCase()
    
    // Check for approval status
    if (lowerStatus === "pending") {
      return {
        dotColor: "bg-orange-500",
        text: "Pending",
        textColor: "text-ui-fg-base",
      }
    }
    
    // Check product status
    if (lowerStatus === "published") {
      return {
        dotColor: "bg-green-500",
        text: "Published",
        textColor: "text-ui-fg-base",
      }
    }
    
    if (lowerStatus === "rejected") {
      return {
        dotColor: "bg-red-500",
        text: "Rejected",
        textColor: "text-ui-fg-base",
      }
    }
    
    // Default to draft
    return {
      dotColor: "bg-gray-400",
      text: "Draft",
      textColor: "text-ui-fg-subtle",
    }
  }

  const config = getStatusConfig()

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
      <span className={config.textColor}>{config.text}</span>
    </div>
  )
}

const VendorProductsPage = () => {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadProducts = async () => {
      try {
        const data = await vendorProductsApi.list()
        setProducts(data?.products || [])
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load products")
        console.error("Products error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [router])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading products...</Text>
      </Container>
    )
  } else if (error) {
    content = (
      <Container className="p-6">
        <Text className="text-ui-fg-error">{error}</Text>
      </Container>
    )
  } else {
    content = (
    <Container className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Products</Heading>
          <Text className="text-ui-fg-subtle">Manage your products</Text>
        </div>
        <Button variant="primary" onClick={() => router.push("/products/new")}>
          Create Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="p-8 text-center border border-ui-border-base rounded-lg">
          <Text className="text-ui-fg-subtle mb-4">No products found</Text>
          <Button variant="primary" onClick={() => router.push("/products/new")}>
            Create your first product
          </Button>
        </div>
      ) : (
        <div className="border border-ui-border-base rounded-lg overflow-hidden">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {products.map((product) => (
                <Table.Row key={product.id}>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      {product.thumbnail && (
                        <img
                          src={product.thumbnail}
                          alt={product.title}
                          className="w-10 h-10 object-cover rounded"
                        />
                      )}
                      <div className="flex flex-col">
                        <Text className="font-medium">{product.title}</Text>
                        {product.handle && product.handle !== product.title && (
                          <Text className="text-ui-fg-subtle text-sm">{product.handle}</Text>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusIndicator 
                      status={
                        product.metadata?.approval_status === "pending" 
                          ? "pending"
                          : product.metadata?.approval_status === "rejected"
                          ? "rejected"
                          : product.status === "published" 
                          ? "published" 
                          : "draft"
                      } 
                    />
                  </Table.Cell>
                  <Table.Cell>
                      <Text className="text-ui-fg-subtle">{formatDate(product.created_at)}</Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      variant="transparent"
                        onClick={() => router.push(`/products/${product.id}`)}
                    >
                      Edit
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorProductsPage

