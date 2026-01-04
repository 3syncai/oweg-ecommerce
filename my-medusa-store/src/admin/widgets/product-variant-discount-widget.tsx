"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text, Badge, Table, IconButton, Input, Button } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { PencilSquare, XMark, Check } from "@medusajs/icons"

type AdminProductVariant = {
    id: string
    title?: string
    sku?: string
    product?: {
        id: string
        title: string
    }
}

type DiscountItem = {
    product_title: string
    product_id: string
    variant_id: string
    sku: string
    currency_code: string
    base_amount: number
    discounted_amount: number
    discount_value: number
    discount_percent: number
    price_list_id: string
    price_list_title: string
}

const ProductVariantDiscountWidget = ({ data }: DetailWidgetProps<AdminProductVariant>) => {
    const [discounts, setDiscounts] = useState<DiscountItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editedPrice, setEditedPrice] = useState<string>("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchDiscounts()
    }, [data.id])

    const fetchDiscounts = async () => {
        try {
            setLoading(true)
            setError(null)

            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
            const response = await fetch(`${backend}/vendor/products/discounts`, {
                credentials: "include",
            })

            if (!response.ok) {
                throw new Error(`Failed to fetch discounts: ${response.statusText}`)
            }

            const result = await response.json()

            // Filter discounts for this specific variant
            const variantDiscounts = (result.discounts || []).filter(
                (discount: DiscountItem) => discount.variant_id === data.id
            )

            setDiscounts(variantDiscounts)
        } catch (err: any) {
            console.error("Failed to fetch discounts:", err)
            setError(err.message || "Failed to load discounts")
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (index: number, currentPrice: number) => {
        setEditingIndex(index)
        setEditedPrice(currentPrice.toString())
    }

    const handleCancel = () => {
        setEditingIndex(null)
        setEditedPrice("")
    }

    const handleSave = async (index: number) => {
        const discount = discounts[index]
        const newPrice = parseFloat(editedPrice)

        if (isNaN(newPrice) || newPrice <= 0) {
            alert("Please enter a valid price")
            return
        }

        if (newPrice >= discount.base_amount) {
            alert("Discounted price must be less than base price")
            return
        }

        try {
            setSaving(true)
            const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

            const response = await fetch(`${backend}/vendor/products/discounts/update`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                    variant_id: discount.variant_id,
                    price_list_id: discount.price_list_id,
                    currency_code: discount.currency_code,
                    amount: newPrice,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.message || "Failed to update price")
            }

            // Refresh discounts
            await fetchDiscounts()
            setEditingIndex(null)
            setEditedPrice("")
        } catch (err: any) {
            console.error("Failed to update price:", err)
            alert(err.message || "Failed to update price")
        } finally {
            setSaving(false)
        }
    }

    const formatCurrency = (amount: number, currencyCode: string) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode.toUpperCase(),
        }).format(amount) // Amounts already in correct format from SQL query
    }

    if (loading) {
        return (
            <Container>
                <div style={{ padding: 16 }}>
                    <Heading level="h2" style={{ marginBottom: 8 }}>
                        Discounted Prices
                    </Heading>
                    <Text style={{ color: "var(--fg-muted)" }}>Loading discount information...</Text>
                </div>
            </Container>
        )
    }

    if (error) {
        return (
            <Container>
                <div style={{ padding: 16 }}>
                    <Heading level="h2" style={{ marginBottom: 8 }}>
                        Discounted Prices
                    </Heading>
                    <div style={{
                        padding: 16,
                        background: "var(--bg-error-subtle)",
                        border: "1px solid var(--border-error)",
                        borderRadius: 8
                    }}>
                        <Text style={{ color: "var(--fg-error)" }}>
                            Error: {error}
                        </Text>
                    </div>
                </div>
            </Container>
        )
    }

    return (
        <Container>
            <div style={{ padding: 16 }}>
                <div style={{ marginBottom: 16 }}>
                    <Heading level="h2" style={{ marginBottom: 4 }}>
                        Discounted Prices
                    </Heading>
                    <Text size="small" style={{ color: "var(--fg-muted)" }}>
                        Active price list discounts for this variant
                    </Text>
                </div>

                {discounts.length === 0 ? (
                    <div style={{
                        textAlign: "center",
                        padding: 32,
                        background: "var(--bg-subtle)",
                        borderRadius: 8,
                        border: "1px solid var(--border-base)"
                    }}>
                        <Text style={{ color: "var(--fg-muted)" }}>
                            No active discounts for this variant
                        </Text>
                    </div>
                ) : (
                    <div style={{
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-base)",
                        borderRadius: 8,
                        overflow: "hidden"
                    }}>
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Price List</Table.HeaderCell>
                                    <Table.HeaderCell>Currency</Table.HeaderCell>
                                    <Table.HeaderCell>Base Price</Table.HeaderCell>
                                    <Table.HeaderCell>Discounted Price</Table.HeaderCell>
                                    <Table.HeaderCell>Discount</Table.HeaderCell>
                                    <Table.HeaderCell>Status</Table.HeaderCell>
                                    <Table.HeaderCell>Actions</Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {discounts.map((discount, index) => (
                                    <Table.Row key={`${discount.price_list_id}-${index}`}>
                                        <Table.Cell>
                                            <div>
                                                <Text weight="plus" size="small">
                                                    {discount.price_list_title}
                                                </Text>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text size="small">{discount.currency_code.toUpperCase()}</Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text size="small" style={{ color: "var(--fg-muted)", textDecoration: "line-through" }}>
                                                {formatCurrency(discount.base_amount, discount.currency_code)}
                                            </Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            {editingIndex === index ? (
                                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={editedPrice}
                                                        onChange={(e) => setEditedPrice(e.target.value)}
                                                        size="small"
                                                        style={{ width: 120 }}
                                                        disabled={saving}
                                                    />
                                                    <Button
                                                        size="small"
                                                        variant="transparent"
                                                        onClick={() => handleSave(index)}
                                                        disabled={saving}
                                                    >
                                                        <Check />
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="transparent"
                                                        onClick={handleCancel}
                                                        disabled={saving}
                                                    >
                                                        <XMark />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Text weight="plus" size="small" style={{ color: "var(--fg-success)" }}>
                                                    {formatCurrency(discount.discounted_amount, discount.currency_code)}
                                                </Text>
                                            )}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <Badge color="green" size="small">
                                                    -{discount.discount_percent}%
                                                </Badge>
                                                <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
                                                    Save {formatCurrency(discount.discount_value, discount.currency_code)}
                                                </Text>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Badge color="green" size="small">Active</Badge>
                                        </Table.Cell>
                                        <Table.Cell>
                                            {editingIndex !== index && (
                                                <IconButton
                                                    size="small"
                                                    variant="transparent"
                                                    onClick={() => handleEdit(index, discount.discounted_amount)}
                                                >
                                                    <PencilSquare />
                                                </IconButton>
                                            )}
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                )}
            </div>
        </Container>
    )
}

export const config = defineWidgetConfig({
    zone: "product_variant.details.after",
})

export default ProductVariantDiscountWidget
