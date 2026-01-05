"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Container, Heading, Text, Table, Button, Input, StatusBadge, Badge } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorInventoryApi } from "@/lib/api/client"
import { MagnifyingGlass, PencilSquare, Check, XMark } from "@medusajs/icons"

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

// Status indicator component matching admin panel style
const StockStatus = ({ quantity }: { quantity: number }) => {
    if (quantity === 0) {
        return (
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-ui-fg-base">Out of Stock</span>
            </div>
        )
    }

    if (quantity < 10) {
        return (
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-ui-fg-base">Low Stock</span>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-ui-fg-base">In Stock</span>
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
                console.error('Failed to fetch inventory')
            }
        } catch (error: any) {
            console.error('Error fetching inventory:', error)
            if (error.status === 401) {
                router.push('/login')
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
                // Update local state
                setInventory(prev => prev.map(item =>
                    item.variant_id === variantId
                        ? { ...item, stock_quantity: editValue }
                        : item
                ))
                setEditingId(null)
            } else {
                alert('Failed to update stock')
            }
        } catch (error: any) {
            console.error('Error updating inventory:', error)
            alert(error.message || 'Error updating stock')
        } finally {
            setSaving(false)
        }
    }

    const filteredInventory = inventory.filter(item =>
        item.product_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.variant_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.variant_sku?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const content = (
        <Container className="p-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <Heading level="h1">Inventory</Heading>
                    <Text className="text-ui-fg-subtle">Manage stock levels for your products</Text>
                </div>

                {/* Stats Summary */}
                {!loading && inventory.length > 0 && (
                    <div className="flex gap-4">
                        <div className="px-3 py-1.5 border border-ui-border-base rounded-md">
                            <Text className="text-ui-fg-subtle text-xs">Total Items</Text>
                            <Text className="font-medium">{inventory.length}</Text>
                        </div>
                        <div className="px-3 py-1.5 border border-ui-border-base rounded-md">
                            <Text className="text-ui-fg-subtle text-xs">Out of Stock</Text>
                            <Text className="font-medium text-red-600">{inventory.filter(i => i.stock_quantity === 0).length}</Text>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
                <div className="relative w-full">
                    <Input
                        placeholder="Search products, SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ui-fg-muted">
                        <MagnifyingGlass />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-12 text-ui-fg-subtle">
                    Loading inventory...
                </div>
            ) : filteredInventory.length === 0 ? (
                <div className="p-12 text-center border border-ui-border-base rounded-lg border-dashed">
                    <Text className="text-ui-fg-subtle mb-4">No inventory items found</Text>
                </div>
            ) : (
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Product</Table.HeaderCell>
                                <Table.HeaderCell>Variant / SKU</Table.HeaderCell>
                                <Table.HeaderCell>Location</Table.HeaderCell>
                                <Table.HeaderCell>Stock Status</Table.HeaderCell>
                                <Table.HeaderCell>Quantity</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filteredInventory.map((item) => (
                                <Table.Row key={item.variant_id}>
                                    <Table.Cell>
                                        <div className="flex items-center gap-3">
                                            {item.product_thumbnail ? (
                                                <img
                                                    src={item.product_thumbnail}
                                                    alt={item.product_title}
                                                    className="w-8 h-8 object-cover rounded"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 bg-ui-bg-base-hover rounded flex items-center justify-center text-xs text-ui-fg-subtle">
                                                    Img
                                                </div>
                                            )}
                                            <Text className="font-medium text-sm truncate max-w-[200px]">
                                                {item.product_title}
                                            </Text>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="flex flex-col">
                                            <Text className="text-sm">{item.variant_title || 'Default'}</Text>
                                            {item.variant_sku && (
                                                <Text className="text-xs text-ui-fg-subtle font-mono">
                                                    {item.variant_sku}
                                                </Text>
                                            )}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="flex items-center gap-2">
                                            <Badge size="small" color="grey">
                                                {item.location_name}
                                            </Badge>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <StockStatus quantity={item.stock_quantity} />
                                    </Table.Cell>
                                    <Table.Cell>
                                        {editingId === item.variant_id ? (
                                            <Input
                                                type="number"
                                                min={0}
                                                value={editValue}
                                                onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                                                className="w-24 h-8"
                                                autoFocus
                                            />
                                        ) : (
                                            <Text className="font-mono text-sm">{item.stock_quantity}</Text>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        {editingId === item.variant_id ? (
                                            <div className="flex items-center justify-end gap-2">
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
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}
        </Container>
    )

    return <VendorShell>{content}</VendorShell>
}
