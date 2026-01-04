"use client"

import React, { useEffect, useState } from "react"
import { Container, Heading, Text, Table, Badge, Input } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorCategoriesApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Category = {
  id: string
  name: string
  handle: string
  is_active: boolean
  is_internal: boolean
  parent_category_id: string | null
  parent_category?: Category
  category_children?: Category[]
}

const VendorCategoriesPage = () => {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem("vendor_token")
        if (!token) {
          router.push("/login")
          setLoading(false)
          return
        }

        const data = await vendorCategoriesApi.list({ limit: 100, offset: 0 })
        console.log("Categories data:", data)
        setCategories(data.product_categories || [])
      } catch (error) {
        console.error("Failed to fetch categories:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [router])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }

  // Build a tree structure
  const buildCategoryTree = (cats: Category[]) => {
    const categoryMap = new Map<string, Category & { children: Category[] }>()
    const rootCategories: (Category & { children: Category[] })[] = []

    // First pass: create all nodes
    cats.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] })
    })

    // Second pass: build tree
    cats.forEach((cat) => {
      const node = categoryMap.get(cat.id)!
      if (cat.parent_category_id) {
        const parent = categoryMap.get(cat.parent_category_id)
        if (parent) {
          parent.children.push(node)
        } else {
          rootCategories.push(node)
        }
      } else {
        rootCategories.push(node)
      }
    })

    return rootCategories
  }

  const filterCategories = (
    cats: (Category & { children: Category[] })[],
    query: string
  ): (Category & { children: Category[] })[] => {
    if (!query) return cats
    return cats.filter((cat) => cat.name.toLowerCase().includes(query.toLowerCase()))
  }

  const renderCategoryRow = (
    category: Category & { children: Category[] },
    level: number = 0
  ): React.ReactElement[] => {
    const hasChildren = category.children && category.children.length > 0
    const isExpanded = expandedCategories.has(category.id)
    const rows: React.ReactElement[] = []

    rows.push(
      <Table.Row 
        key={category.id}
        style={{
          backgroundColor: level > 0 ? "var(--bg-subtle)" : "transparent",
        }}
      >
        <Table.Cell>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: level * 24 }}>
            {hasChildren && (
              <button
                onClick={() => toggleCategory(category.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--fg-muted)",
                }}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            )}
            {!hasChildren && <span style={{ width: 16 }} />}
            <Text>{category.name}</Text>
          </div>
        </Table.Cell>
        <Table.Cell>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            {category.handle}
          </Text>
        </Table.Cell>
        <Table.Cell>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: category.is_active ? "#10b981" : "#6b7280",
              }}
            />
            <Text size="small">{category.is_active ? "Active" : "Inactive"}</Text>
          </div>
        </Table.Cell>
        <Table.Cell>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: category.is_internal ? "#6b7280" : "#10b981",
              }}
            />
            <Text size="small">{category.is_internal ? "Internal" : "Public"}</Text>
          </div>
        </Table.Cell>
      </Table.Row>
    )

    if (hasChildren && isExpanded) {
      category.children.forEach((child) => {
        const childWithChildren = child as Category & { children: Category[] }
        rows.push(...renderCategoryRow(childWithChildren, level + 1))
      })
    }

    return rows
  }

  const categoryTree = buildCategoryTree(categories)
  const filteredTree = filterCategories(categoryTree, searchQuery)

  return (
    <VendorShell>
      <div style={{ padding: "24px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Heading level="h1">Categories</Heading>
          </div>
          <Text size="small" style={{ color: "var(--fg-muted)" }}>
            Organize products into categories, and manage those categories' ranking and hierarchy.
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
            <Text>Loading categories...</Text>
          </Container>
        ) : categories.length === 0 ? (
          <Container>
            <Text>No categories found.</Text>
          </Container>
        ) : (
          <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: 8 }}>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Handle</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Visibility</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredTree.flatMap((category) => renderCategoryRow(category))}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
    </VendorShell>
  )
}

export default VendorCategoriesPage

