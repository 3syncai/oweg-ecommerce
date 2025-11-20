"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Table, Button } from "@medusajs/ui"
import VendorShell from "../../../components/VendorShell"
// Icons removed - using text labels instead

type Product = {
  id: string
  title: string
  status: string
  created_at: string
  thumbnail?: string
  handle?: string
}

const VendorProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    
    if (!vendorToken) {
      window.location.href = "/app/login"
      return
    }

    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    const loadProducts = async () => {
      try {
        const res = await fetch(`${backend}/vendor/products`, {
          headers: { Authorization: `Bearer ${vendorToken}` },
        })

        if (res.status === 403) {
          window.location.href = "/vendor/pending"
          return
        }

        if (!res.ok) {
          throw new Error(`Failed to load products: ${res.status}`)
        }

        const data = await res.json()
        setProducts(data?.products || [])
      } catch (e: any) {
        setError(e?.message || "Failed to load products")
        console.error("Products error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [])

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
        <Button variant="primary" onClick={() => window.location.href = "/app/vendor/products/new"}>
          Create Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="p-8 text-center border border-ui-border-base rounded-lg">
          <Text className="text-ui-fg-subtle mb-4">No products found</Text>
          <Button variant="primary" onClick={() => window.location.href = "/app/vendor/products/new"}>
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
                      <div>
                        <Text className="font-medium">{product.title}</Text>
                        {product.handle && (
                          <Text className="text-ui-fg-subtle text-sm">{product.handle}</Text>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                      <Badge color={product.status === "published" ? "green" : "grey"}>
                      {product.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                      <Text className="text-ui-fg-subtle">{formatDate(product.created_at)}</Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      variant="transparent"
                        onClick={() => (window.location.href = `/app/vendor/products/${product.id}`)}
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

// Explicitly no config export to prevent sidebar registration
// Route is still accessible at /app/vendor/products
// export const config = defineRouteConfig({
//   label: "Products",
// })

export default VendorProductsPage

