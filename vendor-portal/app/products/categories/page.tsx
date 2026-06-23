"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Button, clx } from "@medusajs/ui"
import { ChevronDown, ChevronRight, MagnifyingGlass, Tag } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot from "@/components/dashboard/StatusDot"
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

const buildCategoryTree = (cats: Category[]) => {
  const categoryMap = new Map<string, Category & { children: Category[] }>()
  const rootCategories: (Category & { children: Category[] })[] = []

  cats.forEach((cat) => {
    categoryMap.set(cat.id, { ...cat, children: [] })
  })

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
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const stats = useMemo(() => {
    const active = categories.filter((cat) => cat.is_active).length
    const publicCount = categories.filter((cat) => !cat.is_internal).length
    return { total: categories.length, active, publicCount }
  }, [categories])

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories])
  const filteredTree = useMemo(
    () => filterCategories(categoryTree, searchQuery.trim().toLowerCase()),
    [categoryTree, searchQuery]
  )

  const renderCategoryRow = (
    category: Category & { children: Category[] },
    level: number = 0
  ): React.ReactElement[] => {
    const hasChildren = category.children && category.children.length > 0
    const isExpanded = expandedCategories.has(category.id)
    const rows: React.ReactElement[] = []

    rows.push(
      <div
        key={category.id}
        className={clx(
          "grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] md:items-center md:gap-4",
          level > 0 && "bg-ui-bg-subtle/20"
        )}
      >
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: level * 20 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCategory(category.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-fg-muted transition-colors hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
            >
              {isExpanded ? <ChevronDown /> : <ChevronRight />}
            </button>
          ) : (
            <span className="inline-block h-6 w-6 shrink-0" />
          )}
          <Text weight={level === 0 ? "plus" : "regular"} className="truncate">
            {category.name}
          </Text>
        </div>

        <div className="md:contents">
          <div className="flex items-center gap-2 md:block">
            <Text size="xsmall" className="text-ui-fg-muted md:hidden">
              Handle
            </Text>
            <Text size="small" className="truncate font-mono text-ui-fg-subtle">
              {category.handle}
            </Text>
          </div>

          <div className="flex items-center gap-2 md:block">
            <Text size="xsmall" className="text-ui-fg-muted md:hidden">
              Status
            </Text>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot variant={category.is_active ? "success" : "neutral"} />
              <Text size="small">{category.is_active ? "Active" : "Inactive"}</Text>
            </span>
          </div>

          <div className="flex items-center gap-2 md:block">
            <Text size="xsmall" className="text-ui-fg-muted md:hidden">
              Visibility
            </Text>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot variant={category.is_internal ? "neutral" : "success"} />
              <Text size="small">{category.is_internal ? "Internal" : "Public"}</Text>
            </span>
          </div>
        </div>
      </div>
    )

    if (hasChildren && isExpanded) {
      category.children.forEach((child) => {
        rows.push(...renderCategoryRow(child as Category & { children: Category[] }, level + 1))
      })
    }

    return rows
  }

  let content

  if (loading) {
    content = (
      <PageSkeleton label="Loading categories…" stats={3} rows={8} cols={4} showAction={false} />
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: "0ms" }}
        >
          <Heading level="h1" className="text-2xl md:text-3xl">
            Categories
          </Heading>
          <Text className="mt-1 text-ui-fg-subtle">
            {stats.total > 0
              ? `${stats.total} categories · ${stats.active} active · ${stats.publicCount} public`
              : "Organize products into categories and manage hierarchy"}
          </Text>
        </div>

        {categories.length > 0 && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-3 animate-fade-in-up-slow"
            style={{ animationDelay: "40ms" }}
          >
            <StatCard
              icon={<Tag />}
              label="Total categories"
              value={stats.total}
              subtext={<Text className="text-ui-fg-subtle">In catalog tree</Text>}
            />
            <StatCard
              icon={<Tag />}
              label="Active"
              value={stats.active}
              subtext={
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="success" />
                  <Text size="small">Available for products</Text>
                </span>
              }
            />
            <StatCard
              icon={<Tag />}
              label="Public"
              value={stats.publicCount}
              subtext={
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="success" />
                  <Text size="small">Visible to customers</Text>
                </span>
              }
            />
          </div>
        )}

        {categories.length === 0 ? (
          <div className="animate-fade-in-up" style={{ animationDelay: "80ms" }}>
            <EmptyState
              accent="green"
              icon={<Tag />}
              title="No categories found"
              description="Categories will appear here once they are available in your store catalog."
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
                placeholder="Search categories…"
                className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm text-ui-fg-base outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
              />
            </div>

            <div
              className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base"
              style={{ animationDelay: "120ms" }}
            >
              {filteredTree.length === 0 ? (
                <div className="p-10 text-center">
                  <Text className="text-ui-fg-subtle">No categories match your search.</Text>
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
                  <div className="hidden border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] md:gap-4">
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Name
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Handle
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Status
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Visibility
                    </Text>
                  </div>

                  <div className="divide-y divide-ui-border-base/70">
                    {filteredTree.flatMap((category) => renderCategoryRow(category))}
                  </div>
                </>
              )}
            </div>

            <Text size="small" className="text-ui-fg-muted">
              Showing {filteredTree.length} top-level categor
              {filteredTree.length === 1 ? "y" : "ies"}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </Text>
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorCategoriesPage
