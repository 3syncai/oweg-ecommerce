"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Container, Heading, Text, Button, Input } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot from "@/components/dashboard/StatusDot"
import { vendorInventoryApi } from "@/lib/api/client"
import { MagnifyingGlass, PencilSquare, Check, XMark, ArchiveBox } from "@medusajs/icons"

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

const ProductThumbnail = ({ item }: { item: InventoryItem }) => {
  if (item.product_thumbnail) {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover">
        <Image
          src={item.product_thumbnail}
          alt={item.product_title}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover text-xs font-semibold text-ui-fg-muted">
      {item.product_title?.[0]?.toUpperCase() || "P"}
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

  useEffect(() => {
    fetchInventory()
  }, [])

  const fetchInventory = async () => {
    try {
      setLoading(true)
      const data = await vendorInventoryApi.list()

      if (data.success) {
        setInventory(data.inventory || [])
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
  }

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

  const stats = useMemo(() => {
    const outOfStock = inventory.filter((item) => item.stock_quantity === 0).length
    const lowStock = inventory.filter(
      (item) => item.stock_quantity > 0 && item.stock_quantity < 10
    ).length
    const inStock = inventory.filter((item) => item.stock_quantity >= 10).length

    return { total: inventory.length, outOfStock, lowStock, inStock }
  }, [inventory])

  const filteredInventory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return inventory

    return inventory.filter(
      (item) =>
        item.product_title.toLowerCase().includes(query) ||
        item.variant_title?.toLowerCase().includes(query) ||
        item.variant_sku?.toLowerCase().includes(query)
    )
  }, [inventory, searchQuery])

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
              ? `${stats.total} variant${stats.total > 1 ? "s" : ""} tracked · ${stats.lowStock} low stock`
              : "Manage stock levels for your products"}
          </Text>
        </div>
      </div>

      {!loading && inventory.length > 0 && (
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-4 animate-fade-in-up-slow"
          style={{ animationDelay: "40ms" }}
        >
          <StatCard
            icon={<ArchiveBox />}
            label="Total items"
            value={stats.total}
            subtext={<Text className="text-ui-fg-subtle">Variants tracked</Text>}
          />
          <StatCard
            icon={<ArchiveBox />}
            label="In stock"
            value={stats.inStock}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="success" />
                <Text size="small">10+ units</Text>
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
                <Text size="small">Under 10 units</Text>
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
                <Text size="small">Needs restock</Text>
              </span>
            }
          />
        </div>
      )}

      {!loading && inventory.length > 0 && (
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
          <div className="grid grid-cols-12 gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="col-span-2 h-3 rounded-md bg-ui-bg-base-hover animate-pulse" />
            ))}
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, r) => (
              <div
                key={r}
                className="grid grid-cols-12 items-center gap-4 border-b border-ui-border-base/70 px-4 py-4 last:border-b-0"
              >
                <div className="col-span-1">
                  <div className="h-10 w-10 rounded-lg bg-ui-bg-base-hover animate-pulse" />
                </div>
                <div className="col-span-3 space-y-2">
                  <div className="h-3 w-3/4 rounded-md bg-ui-bg-base-hover animate-pulse" />
                  <div className="h-3 w-1/2 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
                </div>
                <div className="col-span-2">
                  <div className="h-3 w-2/3 rounded-md bg-ui-bg-base-hover animate-pulse" />
                </div>
                <div className="col-span-2">
                  <div className="h-5 w-20 rounded-full bg-ui-bg-base-hover animate-pulse" />
                </div>
                <div className="col-span-2">
                  <div className="h-3 w-12 rounded-md bg-ui-bg-base-hover animate-pulse" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <div className="h-8 w-8 rounded-md bg-ui-bg-base-hover animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-ui-border-base/70 py-3 text-ui-fg-subtle">
            <span className="h-2 w-2 rounded-full bg-ui-fg-muted animate-pulse" />
            <Text size="small">Loading inventory…</Text>
          </div>
        </div>
      ) : filteredInventory.length === 0 ? (
        searchQuery ? (
          <EmptyState
            accent="gray"
            icon={<MagnifyingGlass />}
            title="No matching inventory"
            description={`No products or variants match "${searchQuery}". Try a different name or SKU.`}
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
            <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px_100px_80px] md:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Product
              </Text>
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Variant / SKU
              </Text>
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Location
              </Text>
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Stock status
              </Text>
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Quantity
              </Text>
              <Text size="small" weight="plus" className="text-right text-ui-fg-subtle">
                Actions
              </Text>
            </div>

            <div className="divide-y divide-ui-border-base/70">
              {filteredInventory.map((item) => (
                <div
                  key={item.variant_id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px_100px_80px] md:items-center md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductThumbnail item={item} />
                    <Text weight="plus" className="truncate">
                      {item.product_title}
                    </Text>
                  </div>

                  <div className="md:contents">
                    <div className="min-w-0">
                      <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                        Variant / SKU
                      </Text>
                      <Text size="small">{item.variant_title || "Default"}</Text>
                      {item.variant_sku && (
                        <Text size="xsmall" className="font-mono text-ui-fg-subtle">
                          {item.variant_sku}
                        </Text>
                      )}
                    </div>

                    <div>
                      <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                        Location
                      </Text>
                      <span className="inline-flex rounded-full border border-ui-border-base/70 bg-ui-bg-subtle/50 px-2.5 py-1 text-xs text-ui-fg-subtle">
                        {item.location_name}
                      </span>
                    </div>

                    <div>
                      <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                        Stock status
                      </Text>
                      <StockStatus quantity={item.stock_quantity} />
                    </div>

                    <div>
                      <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                        Quantity
                      </Text>
                      {editingId === item.variant_id ? (
                        <Input
                          type="number"
                          min={0}
                          value={editValue}
                          onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                          className="h-8 w-24"
                          autoFocus
                        />
                      ) : (
                        <Text className="font-mono text-sm">{item.stock_quantity}</Text>
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
                </div>
              ))}
            </div>
          </div>

          <Text size="small" className="text-ui-fg-muted">
            Showing {filteredInventory.length} of {inventory.length} items
          </Text>
        </>
      )}
    </Container>
  )

  return <VendorShell>{content}</VendorShell>
}
