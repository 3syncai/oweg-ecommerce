"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Table, Badge, Input, Button } from "@medusajs/ui"
import { Plus } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import { vendorCollectionsApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Collection = {
  id: string
  title: string
  handle: string
  created_at: string
  updated_at: string
  products?: any[]
}

const VendorCollectionsPage = () => {
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const token = localStorage.getItem("vendor_token")
        if (!token) {
          router.push("/login")
          setLoading(false)
          return
        }

        const data = await vendorCollectionsApi.list({ limit: 100, offset: 0 })
        console.log("Collections data:", data)
        setCollections(data.collections || [])
      } catch (error) {
        console.error("Failed to fetch collections:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCollections()
  }, [router])

  const filteredCollections = collections.filter((collection) =>
    collection.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <VendorShell>
      <div style={{ padding: "24px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Heading level="h1">Collections</Heading>
            <Button variant="secondary" size="small">
              <Plus />
              Create
            </Button>
          </div>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            Group products to make them easier to manage and discover.
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        {loading ? (
          <Container>
            <Text>Loading collections...</Text>
          </Container>
        ) : collections.length === 0 ? (
          <div
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: 8,
              padding: "64px 32px",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ margin: "0 auto", opacity: 0.3 }}
              >
                <rect x="8" y="16" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M8 24H56" stroke="currentColor" strokeWidth="2" />
                <circle cx="16" cy="20" r="2" fill="currentColor" />
                <circle cx="24" cy="20" r="2" fill="currentColor" />
                <circle cx="32" cy="20" r="2" fill="currentColor" />
              </svg>
            </div>
            <Heading level="h2" style={{ marginBottom: 8 }}>
              No collections yet
            </Heading>
            <Text size="small" style={{ color: "var(--fg-muted)", marginBottom: 24 }}>
              Create your first collection to organize your products
            </Text>
            <Button variant="secondary">
              <Plus />
              Create Collection
            </Button>
          </div>
        ) : (
          <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: 8 }}>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Title</Table.HeaderCell>
                  <Table.HeaderCell>Handle</Table.HeaderCell>
                  <Table.HeaderCell>Products</Table.HeaderCell>
                  <Table.HeaderCell>Created</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredCollections.length === 0 ? (
                  <Table.Row>
                    <td colSpan={4} style={{ padding: "32px", textAlign: "center" }}>
                      <Text style={{ color: "var(--fg-muted)" }}>No collections match your search</Text>
                    </td>
                  </Table.Row>
                ) : (
                  filteredCollections.map((collection) => (
                    <Table.Row key={collection.id}>
                      <Table.Cell>
                        <Text weight="plus">{collection.title}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>
                          {collection.handle}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="grey">{collection.products?.length || 0} products</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>
                          {new Date(collection.created_at).toLocaleDateString()}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
    </VendorShell>
  )
}

export default VendorCollectionsPage

