"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Container, Heading, Text, Button, Input, clx } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot from "@/components/dashboard/StatusDot"
import { vendorInventoryApi } from "@/lib/api/client"
import { useVendorLive } from "@/lib/useVendorLive"
import {
  MagnifyingGlass,
  PencilSquare,
  Check,
  XMark,
  ArchiveBox,
  TriangleRightMini,
  ChevronLeft,
  ChevronRight,
} from "@medusajs/icons"

type InventoryItem = {
  product_id: string
  product_title: string
  product_thumbnail: string | null
  variant_id: string
  variant_title: string
  variant_sku: string | null
  inventory_item_id: string | null
  stock_quantity: number
  location_name: string
  manage_inventory: boolean
}

type ProductGroup = {
  product_id: string
  product_title: string
  product_thumbnail: string | null
  variants: InventoryItem[]
  totalStock: number
  outOfStock: number
  lowStock: number
}

const PAGE_SIZE = 50

const StockStatus = ({ quantity }: { quantity: number }) => {
  if (quantity === 0) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="error" />
        <Text size="small">Out of stock</Text>
      </span>
    )
  }

  if (quantity < 10) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="warning" />
        <Text size="small">Low stock</Text>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot variant="success" />
      <Text size="small">In stock</Text>
    </span>
  )
}

const ProductThumbnail = ({
  title,
  thumbnail,
}: {
  title: string
  thumbnail: string | null
}) => {
  if (thumbnail) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover">
        <Image src={thumbnail} alt={title} fill className="object-cover" unoptimized />
      </div>
    )
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover text-xs font-semibold text-ui-fg-muted">
      {title?.[0]?.toUpperCase() || "P"}
    </div>
  )
}

export default function InventoryPage() {
  const router = useRouter()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [page, setPage] = useState(1)
  const [totalFiltered, setTotalFiltered] = useState(0)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(searchQuery.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchQuery])

  const fetchInventory = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true)
      const data = await vendorInventoryApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: searchDebounced || undefined,
      })

      if (data.success) {
        setInventory(data.inventory || [])
        setTotalFiltered(
          typeof data.count === "number"
            ? data.count
            : typeof data.total === "number"
              ? data.total
              : (data.inventory || []).length
        )
      } else {
        console.error("Failed to fetch inventory")
      }
    } catch (error: any) {
      console.error("Error fetching inventory:", error)
      if (error.status === 401) {
        router.push("/login")
      }
    } finally {
      setLoading(false)
    }
  }, [router, page, searchDebounced])

  useEffect(() => {
    void fetchInventory()
  }, [fetchInventory])

  useVendorLive({
    onInvalidate: () => {
      void fetchInventory({ silent: true })
    },
  })

  useEffect(() => {
    setPage(1)
  }, [searchDebounced])

  const handleEdit = (item: InventoryItem) => {
    setEditingId(item.variant_id)
    setEditValue(item.stock_quantity)
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue(0)
  }

  const handleSave = async (variantId: string) => {
    try {
      setSaving(true)
      const data = await vendorInventoryApi.update(variantId, editValue)

      if (data.success) {
        setInventory((prev) =>
          prev.map((item) =>
            item.variant_id === variantId ? { ...item, stock_quantity: editValue } : item
          )
        )
        setEditingId(null)
      } else {
        alert("Failed to update stock")
      }
    } catch (error: any) {
      console.error("Error updating inventory:", error)
      alert(error.message || "Error updating stock")
    } finally {
      setSaving(false)
    }
  }

  const toggleExpanded = (productId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const stats = useMemo(() => {
    const outOfStock = inventory.filter((item) => item.stock_quantity === 0).length
    const lowStock = inventory.filter(
      (item) => item.stock_quantity > 0 && item.stock_quantity < 10
    ).length
    const inStock = inventory.filter((item) => item.stock_quantity >= 10).length
    const productCount = new Set(inventory.map((i) => i.product_id)).size

    return { total: totalFiltered, pageTotal: inventory.length, productCount, outOfStock, lowStock, inStock }
  }, [inventory, totalFiltered])

  const productGroups = useMemo(() => {
    const map = new Map<string, ProductGroup>()

    for (const item of inventory) {
      const existing = map.get(item.product_id)
      if (existing) {
        existing.variants.push(item)
        existing.totalStock += item.stock_quantity
        if (item.stock_quantity === 0) existing.outOfStock += 1
        else if (item.stock_quantity < 10) existing.lowStock += 1
      } else {
        map.set(item.product_id, {
          product_id: item.product_id,
          product_title: item.product_title,
          product_thumbnail: item.product_thumbnail,
          variants: [item],
          totalStock: item.stock_quantity,
          outOfStock: item.stock_quantity === 0 ? 1 : 0,
          lowStock:
            item.stock_quantity > 0 && item.stock_quantity < 10 ? 1 : 0,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.product_title.localeCompare(b.product_title)
    )
  }, [inventory])

  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))

  // Auto-expand products that match search when searching variants
  useEffect(() => {
    if (!searchDebounced) return
    setExpandedIds(new Set(productGroups.map((g) => g.product_id)))
  }, [searchDebounced, productGroups])

  const content = (
    <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
      <div
        className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4"
        style={{ animationDelay: "0ms" }}
      >
        <div>
          <Heading level="h1" className="text-2xl md:text-3xl">
            Inventory
          </Heading>
          <Text className="mt-1 text-ui-fg-subtle">
            {stats.total > 0
              ? `${stats.productCount} product${stats.productCount > 1 ? "s" : ""} on this page · ${stats.total} variant${stats.total > 1 ? "s" : ""} · ${stats.lowStock} low stock`
              : "Manage stock levels for your products"}
          </Text>
        </div>
      </div>

      {!loading && totalFiltered > 0 && (
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-4 animate-fade-in-up-slow"
          style={{ animationDelay: "40ms" }}
        >
          <StatCard
            icon={<ArchiveBox />}
            label="Variants"
            value={stats.total}
            subtext={<Text className="text-ui-fg-subtle">{stats.productCount} products on page</Text>}
          />
          <StatCard
            icon={<ArchiveBox />}
            label="In stock"
            value={stats.inStock}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="success" />
                <Text size="small">10+ units (page)</Text>
              </span>
            }
          />
          <StatCard
            icon={<ArchiveBox />}
            label="Low stock"
            value={stats.lowStock}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="warning" />
                <Text size="small">Under 10 units (page)</Text>
              </span>
            }
          />
          <StatCard
            icon={<ArchiveBox />}
            label="Out of stock"
            value={stats.outOfStock}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="error" />
                <Text size="small">Needs restock (page)</Text>
              </span>
            }
          />
        </div>
      )}

      {!loading && (
        <div
          className="animate-fade-in-up relative w-full sm:max-w-sm"
          style={{ animationDelay: "80ms" }}
        >
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, SKU…"
            className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm text-ui-fg-base outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
          />
        </div>
      )}

      {loading ? (
        <div
          className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base"
          style={{ animationDelay: "120ms" }}
        >
          <div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div
                key={r}
                className="flex items-center gap-3 border-b border-ui-border-base/70 px-4 py-4 last:border-b-0"
              >
                <div className="h-10 w-10 rounded-lg bg-ui-bg-base-hover animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded-md bg-ui-bg-base-hover animate-pulse" />
                  <div className="h-3 w-1/5 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-ui-border-base/70 py-3 text-ui-fg-subtle">
            <span className="h-2 w-2 rounded-full bg-ui-fg-muted animate-pulse" />
            <Text size="small">Loading inventory…</Text>
          </div>
        </div>
      ) : productGroups.length === 0 ? (
        searchDebounced ? (
          <EmptyState
            accent="gray"
            icon={<MagnifyingGlass />}
            title="No matching inventory"
            description={`No products or variants match "${searchDebounced}". Try a different name or SKU.`}
            primaryAction={{
              label: "Clear search",
              onClick: () => setSearchQuery(""),
            }}
          />
        ) : (
          <EmptyState
            accent="orange"
            icon={<ArchiveBox />}
            title="No inventory items yet"
            description="Once you publish products with variants, their stock levels will appear here."
            primaryAction={{
              label: "Add product",
              onClick: () => router.push("/products/new"),
            }}
            secondaryAction={{
              label: "View products",
              onClick: () => router.push("/products"),
            }}
          />
        )
      ) : (
        <>
          <div
            className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base"
            style={{ animationDelay: "120ms" }}
          >
            <div className="divide-y divide-ui-border-base/70">
              {productGroups.map((group) => {
                const expanded = expandedIds.has(group.product_id)
                const summaryStatus =
                  group.outOfStock === group.variants.length
                    ? "error"
                    : group.lowStock > 0 || group.outOfStock > 0
                      ? "warning"
                      : "success"

                return (
                  <div key={group.product_id}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.product_id)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ui-bg-subtle/60"
                    >
                      <TriangleRightMini
                        className={clx(
                          "shrink-0 text-ui-fg-muted transition-transform",
                          expanded && "rotate-90"
                        )}
                      />
                      <ProductThumbnail
                        title={group.product_title}
                        thumbnail={group.product_thumbnail}
                      />
                      <div className="min-w-0 flex-1">
                        <Text weight="plus" className="truncate">
                          {group.product_title}
                        </Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {group.variants.length} size
                          {group.variants.length > 1 ? "s" : ""} · {group.totalStock}{" "}
                          total units
                        </Text>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 shrink-0">
                        {group.outOfStock > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ui-fg-subtle">
                            <StatusDot variant="error" />
                            {group.outOfStock} out
                          </span>
                        )}
                        {group.lowStock > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ui-fg-subtle">
                            <StatusDot variant="warning" />
                            {group.lowStock} low
                          </span>
                        )}
                        <StatusDot variant={summaryStatus} />
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-ui-border-base/50 bg-ui-bg-subtle/25">
                        <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_140px_140px_100px_80px] md:gap-4 border-b border-ui-border-base/50 px-4 py-2 pl-14">
                          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
                            Variant / SKU
                          </Text>
                          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
                            Location
                          </Text>
                          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
                            Stock status
                          </Text>
                          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
                            Quantity
                          </Text>
                          <Text
                            size="xsmall"
                            weight="plus"
                            className="text-right text-ui-fg-muted"
                          >
                            Edit
                          </Text>
                        </div>

                        <div className="divide-y divide-ui-border-base/40">
                          {group.variants.map((item) => (
                            <div
                              key={item.variant_id}
                              className="grid grid-cols-1 gap-3 px-4 py-3 pl-14 md:grid-cols-[minmax(0,1.2fr)_140px_140px_100px_80px] md:items-center md:gap-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="min-w-0">
                                <Text size="small">{item.variant_title || "Default"}</Text>
                                {item.variant_sku && (
                                  <Text size="xsmall" className="font-mono text-ui-fg-subtle">
                                    {item.variant_sku}
                                  </Text>
                                )}
                              </div>

                              <div>
                                <span className="inline-flex rounded-full border border-ui-border-base/70 bg-ui-bg-base px-2.5 py-1 text-xs text-ui-fg-subtle">
                                  {item.location_name}
                                </span>
                              </div>

                              <div>
                                <StockStatus quantity={item.stock_quantity} />
                              </div>

                              <div>
                                {editingId === item.variant_id ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(parseInt(e.target.value) || 0)
                                    }
                                    className="h-8 w-24"
                                    autoFocus
                                  />
                                ) : (
                                  <Text className="font-mono text-sm">
                                    {item.stock_quantity}
                                  </Text>
                                )}
                              </div>

                              <div className="flex justify-end">
                                {editingId === item.variant_id ? (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="small"
                                      variant="primary"
                                      onClick={() => handleSave(item.variant_id)}
                                      disabled={saving}
                                    >
                                      {saving ? "..." : <Check />}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="secondary"
                                      onClick={handleCancel}
                                      disabled={saving}
                                    >
                                      <XMark />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="small"
                                    variant="transparent"
                                    onClick={() => handleEdit(item)}
                                    className="text-ui-fg-subtle hover:text-ui-fg-base"
                                  >
                                    <PencilSquare />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
            <Text size="small">
              Showing {inventory.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
              {Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered} variants
            </Text>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
              >
                <ChevronLeft />
              </button>
              <Text size="small">
                Page {page} of {pageCount}
              </Text>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </>
      )}
    </Container>
  )

  return <VendorShell>{content}</VendorShell>
}
