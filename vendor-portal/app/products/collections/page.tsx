"use client"

import { useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Badge, Button } from "@medusajs/ui"
import { MagnifyingGlass, Plus, SquaresPlus } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
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

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

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
        setCollections(data.collections || [])
      } catch (error) {
        console.error("Failed to fetch collections:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCollections()
  }, [router])

  const stats = useMemo(() => {
    const productCount = collections.reduce(
      (sum, collection) => sum + (collection.products?.length || 0),
      0
    )
    const emptyCount = collections.filter(
      (collection) => (collection.products?.length || 0) === 0
    ).length

    return {
      total: collections.length,
      productCount,
      emptyCount,
    }
  }, [collections])

  const filteredCollections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return collections

    return collections.filter(
      (collection) =>
        collection.title.toLowerCase().includes(query) ||
        collection.handle.toLowerCase().includes(query)
    )
  }, [collections, searchQuery])

  let content

  if (loading) {
    content = (
      <PageSkeleton label="Loading collections…" stats={3} rows={6} cols={4} showAction />
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div
          className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Collections
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {stats.total > 0
                ? `${stats.total} collection${stats.total > 1 ? "s" : ""} · ${stats.productCount} products grouped`
                : "Group products to make them easier to manage and discover"}
            </Text>
          </div>
          <Button variant="secondary" size="small">
            <Plus />
            Create
          </Button>
        </div>

        {collections.length > 0 && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-3 animate-fade-in-up-slow"
            style={{ animationDelay: "40ms" }}
          >
            <StatCard
              icon={<SquaresPlus />}
              label="Collections"
              value={stats.total}
              subtext={<Text className="text-ui-fg-subtle">Total groups</Text>}
            />
            <StatCard
              icon={<SquaresPlus />}
              label="Products grouped"
              value={stats.productCount}
              subtext={<Text className="text-ui-fg-subtle">Across all collections</Text>}
            />
            <StatCard
              icon={<SquaresPlus />}
              label="Empty collections"
              value={stats.emptyCount}
              subtext={<Text className="text-ui-fg-subtle">No products assigned</Text>}
            />
          </div>
        )}

        {collections.length === 0 ? (
          <div className="animate-fade-in-up" style={{ animationDelay: "80ms" }}>
            <EmptyState
              accent="purple"
              icon={<SquaresPlus />}
              title="No collections yet"
              description="Create your first collection to organize your products and help customers discover them."
              primaryAction={{
                label: "Create collection",
                onClick: () => {},
              }}
            />
          </div>
        ) : (
          <>
            <div
              className="animate-fade-in-up relative w-full sm:max-w-sm"
              style={{ animationDelay: "80ms" }}
            >
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search collections…"
                className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm text-ui-fg-base outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
              />
            </div>

            <div
              className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base"
              style={{ animationDelay: "120ms" }}
            >
              {filteredCollections.length === 0 ? (
                <div className="p-10 text-center">
                  <Text className="text-ui-fg-subtle">No collections match your search.</Text>
                  <Button
                    variant="transparent"
                    className="mt-3"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                </div>
              ) : (
                <>
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px] gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Title
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Handle
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Products
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Created
                    </Text>
                  </div>

                  <div className="divide-y divide-ui-border-base/70">
                    {filteredCollections.map((collection) => {
                      const productCount = collection.products?.length || 0

                      return (
                        <div
                          key={collection.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px] md:items-center md:gap-4"
                        >
                          <div>
                            <Text weight="plus">{collection.title}</Text>
                          </div>
                          <div>
                            <Text size="small" className="truncate font-mono text-ui-fg-subtle">
                              {collection.handle}
                            </Text>
                          </div>
                          <div>
                            <Badge color={productCount > 0 ? "green" : "grey"}>
                              {productCount} product{productCount === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <div>
                            <Text size="small" className="text-ui-fg-subtle">
                              {formatDate(collection.created_at)}
                            </Text>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <Text size="small" className="text-ui-fg-muted">
              Showing {filteredCollections.length} of {collections.length} collections
            </Text>
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorCollectionsPage
