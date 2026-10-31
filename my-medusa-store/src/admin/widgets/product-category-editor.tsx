import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Label, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type Category = {
  id: string
  name: string
  handle?: string
  parent_category_id?: string | null
}

type Product = {
  id: string
  categories?: Array<{
    id: string
    name?: string
    parent_category_id?: string | null
  }>
  metadata?: Record<string, unknown> | null
}

const toTitleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ""

const toHandle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * Admin product side widget: change category + subcategory with searchable
 * dropdowns (same flow as vendor listing). Supports creating a new category
 * or subcategory when the typed name does not exist.
 */
const ProductCategoryEditorWidget = ({ data }: { data: { id: string } }) => {
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [parentId, setParentId] = useState("")
  const [parentLabel, setParentLabel] = useState("")
  const [subId, setSubId] = useState("")
  const [subLabel, setSubLabel] = useState("")
  const [showParentDrop, setShowParentDrop] = useState(false)
  const [showSubDrop, setShowSubDrop] = useState(false)
  const [filterParent, setFilterParent] = useState(false)
  const [filterSub, setFilterSub] = useState(false)
  const [createParentName, setCreateParentName] = useState("")
  const [createSubName, setCreateSubName] = useState("")

  const backend = (
    typeof window !== "undefined"
      ? process.env.BACKEND_URL || window.location.origin
      : ""
  ).replace(/\/$/, "")

  const rootCats = useMemo(
    () => categories.filter((c) => !c.parent_category_id),
    [categories]
  )
  const subCats = useMemo(
    () =>
      parentId
        ? categories.filter((c) => c.parent_category_id === parentId)
        : [],
    [categories, parentId]
  )

  const parentQuery = filterParent ? parentLabel.trim().toLowerCase() : ""
  const filteredParents = rootCats.filter((c) =>
    toTitleCase(c.name).toLowerCase().includes(parentQuery)
  )
  const subQuery = filterSub ? subLabel.trim().toLowerCase() : ""
  const filteredSubs = subCats.filter((c) => {
    const name = toTitleCase(c.name).toLowerCase()
    if (!subQuery) return true
    return name.startsWith(subQuery) || name.includes(subQuery)
  })

  const parentExact = rootCats.some(
    (c) => toTitleCase(c.name).toLowerCase() === parentLabel.trim().toLowerCase()
  )
  const subExact = subCats.some(
    (c) => toTitleCase(c.name).toLowerCase() === subLabel.trim().toLowerCase()
  )

  const applyFromProduct = (prod: Product, cats: Category[]) => {
    const assigned = prod.categories?.[0]
    if (!assigned) {
      setParentId("")
      setParentLabel("")
      setSubId("")
      setSubLabel("")
      setCreateParentName("")
      setCreateSubName("")
      return
    }
    const full =
      cats.find((c) => c.id === assigned.id) ||
      ({
        id: assigned.id,
        name: assigned.name || "",
        parent_category_id: assigned.parent_category_id,
      } as Category)

    if (full.parent_category_id) {
      const parent =
        cats.find((c) => c.id === full.parent_category_id) ||
        ({
          id: full.parent_category_id,
          name: "",
        } as Category)
      setParentId(parent.id)
      setParentLabel(parent.name ? toTitleCase(parent.name) : "")
      setSubId(full.id)
      setSubLabel(toTitleCase(full.name))
    } else {
      setParentId(full.id)
      setParentLabel(toTitleCase(full.name))
      setSubId("")
      setSubLabel("")
    }
    setCreateParentName("")
    setCreateSubName("")
  }

  const load = async () => {
    setLoading(true)
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch(
          `${backend}/admin/products/${data.id}?fields=*categories,*categories.parent_category`,
          { credentials: "include" }
        ),
        fetch(
          `${backend}/admin/product-categories?fields=id,name,handle,parent_category_id&limit=500`,
          { credentials: "include" }
        ),
      ])
      if (!prodRes.ok) throw new Error("Failed to load product")
      if (!catRes.ok) throw new Error("Failed to load categories")
      const prodJson = await prodRes.json()
      const catJson = await catRes.json()
      const prod = (prodJson.product || prodJson) as Product
      const cats = (catJson.product_categories || []) as Category[]
      setProduct(prod)
      setCategories(cats)
      applyFromProduct(prod, cats)
    } catch (err: any) {
      console.error(err)
      toast.error("Error", { description: err?.message || "Failed to load categories" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id])

  const ensureCategory = async (input: {
    name: string
    parentId?: string | null
  }): Promise<string> => {
    const name = input.name.trim()
    const parentIdValue = input.parentId || null
    const handle = parentIdValue
      ? `${toHandle(
          categories.find((c) => c.id === parentIdValue)?.name || "cat"
        )}-${toHandle(name)}`
      : toHandle(name)

    const existing = categories.find(
      (c) =>
        c.handle === handle ||
        (c.name.toLowerCase() === name.toLowerCase() &&
          (c.parent_category_id || null) === parentIdValue)
    )
    if (existing) return existing.id

    const createRes = await fetch(`${backend}/admin/product-categories`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        handle,
        is_active: true,
        ...(parentIdValue ? { parent_category_id: parentIdValue } : {}),
      }),
    })
    if (!createRes.ok) {
      const text = await createRes.text()
      throw new Error(text || "Failed to create category")
    }
    const created = await createRes.json()
    const id = created.product_category?.id as string
    if (!id) throw new Error("No category id returned")
    setCategories((prev) => [
      ...prev,
      {
        id,
        name,
        handle,
        parent_category_id: parentIdValue,
      },
    ])
    return id
  }

  const handleSave = async () => {
    if (!product) return
    setSaving(true)
    try {
      let targetParentId = parentId
      let targetCategoryId = subId || parentId

      if (!targetParentId && createParentName.trim()) {
        targetParentId = await ensureCategory({ name: createParentName.trim() })
        setParentId(targetParentId)
        setParentLabel(toTitleCase(createParentName.trim()))
        setCreateParentName("")
      }

      if (createSubName.trim()) {
        if (!targetParentId) {
          throw new Error("Select or create a parent category before the subcategory")
        }
        targetCategoryId = await ensureCategory({
          name: createSubName.trim(),
          parentId: targetParentId,
        })
        setSubId(targetCategoryId)
        setSubLabel(toTitleCase(createSubName.trim()))
        setCreateSubName("")
      } else if (subId) {
        targetCategoryId = subId
      } else if (targetParentId) {
        targetCategoryId = targetParentId
      }

      if (!targetCategoryId) {
        throw new Error("Choose a category or type a new one to create")
      }

      const selected = categories.find((c) => c.id === targetCategoryId)
      const updateRes = await fetch(`${backend}/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: [{ id: targetCategoryId }],
          metadata: {
            ...(product.metadata || {}),
            category: selected?.name || subLabel || parentLabel || null,
            categories: [targetCategoryId],
            category_request: null,
            category_request_status: null,
          },
        }),
      })
      if (!updateRes.ok) {
        const text = await updateRes.text()
        throw new Error(text || "Failed to update product category")
      }

      toast.success("Category updated", {
        description: "Product category / subcategory saved.",
      })
      await load()
    } catch (err: any) {
      console.error(err)
      toast.error("Error", {
        description: err?.message || "Failed to save category",
      })
    } finally {
      setSaving(false)
    }
  }

  const currentLabel = useMemo(() => {
    if (!product?.categories?.length) return "None assigned"
    const cat = product.categories[0]
    const full = categories.find((c) => c.id === cat.id)
    if (full?.parent_category_id) {
      const parent = categories.find((c) => c.id === full.parent_category_id)
      return `${parent?.name || "Category"} › ${full.name}`
    }
    return cat.name || full?.name || "Assigned"
  }, [product, categories])

  const dirty =
    (subId || parentId) !== (product?.categories?.[0]?.id || "") ||
    Boolean(createParentName.trim()) ||
    Boolean(createSubName.trim())

  const inputClass =
    "h-9 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2.5 pr-8 text-sm text-ui-fg-base outline-none focus:border-ui-fg-interactive"

  if (loading) {
    return (
      <Container className="p-4">
        <Text size="small" className="text-ui-fg-muted">
          Loading categories…
        </Text>
      </Container>
    )
  }

  return (
    <Container className="flex flex-col gap-3 p-4">
      <div>
        <Heading level="h2" className="text-sm font-semibold">
          Category & subcategory
        </Heading>
        <Text size="small" className="mt-0.5 text-ui-fg-subtle">
          Current: {currentLabel}
        </Text>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <div className="relative">
          <input
            type="text"
            value={parentLabel}
            placeholder="Search or type new category…"
            autoComplete="off"
            className={inputClass}
            onFocus={() => {
              setShowParentDrop(true)
              setFilterParent(false)
            }}
            onBlur={() => setTimeout(() => setShowParentDrop(false), 150)}
            onChange={(e) => {
              const val = e.target.value
              setFilterParent(true)
              setShowParentDrop(true)
              setParentLabel(val)
              setParentId("")
              setSubId("")
              setSubLabel("")
              setCreateSubName("")
              const exact = rootCats.find(
                (c) =>
                  toTitleCase(c.name).toLowerCase() === val.trim().toLowerCase()
              )
              if (exact) {
                setParentId(exact.id)
                setCreateParentName("")
              } else {
                setCreateParentName(val.trim())
              }
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ui-fg-muted"
            onMouseDown={(e) => {
              e.preventDefault()
              setFilterParent(false)
              setShowParentDrop((o) => !o)
            }}
          >
            ▾
          </button>
          {showParentDrop && (
            <div className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-lg">
              {filteredParents.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-ui-bg-subtle"
                  onMouseDown={() => {
                    setParentId(cat.id)
                    setParentLabel(toTitleCase(cat.name))
                    setCreateParentName("")
                    setSubId("")
                    setSubLabel("")
                    setCreateSubName("")
                    setShowParentDrop(false)
                  }}
                >
                  {toTitleCase(cat.name)}
                </button>
              ))}
              {parentLabel.trim() && !parentExact && (
                <button
                  type="button"
                  className="w-full border-t border-ui-border-base px-2.5 py-1.5 text-left text-sm text-ui-fg-interactive hover:bg-ui-bg-subtle"
                  onMouseDown={() => {
                    setCreateParentName(parentLabel.trim())
                    setParentId("")
                    setShowParentDrop(false)
                  }}
                >
                  + Create new: &ldquo;{parentLabel.trim()}&rdquo;
                </button>
              )}
              {!filteredParents.length && !parentLabel.trim() && (
                <div className="px-2.5 py-1.5 text-xs text-ui-fg-muted">
                  No categories yet
                </div>
              )}
            </div>
          )}
        </div>
        {createParentName && !parentId ? (
          <Text size="xsmall" className="text-amber-600">
            Will create parent category &ldquo;{createParentName}&rdquo;
          </Text>
        ) : null}
      </div>

      {(parentId || createParentName) && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            Subcategory under{" "}
            <span className="font-medium">
              {parentId
                ? toTitleCase(rootCats.find((c) => c.id === parentId)?.name || parentLabel)
                : createParentName}
            </span>
          </Label>
          <div className="relative">
            <input
              type="text"
              value={subLabel}
              placeholder={
                subCats.length > 0
                  ? "Search subcategory…"
                  : "Type a subcategory name…"
              }
              autoComplete="off"
              className={inputClass}
              onFocus={() => {
                setShowSubDrop(true)
                setFilterSub(false)
              }}
              onBlur={() => setTimeout(() => setShowSubDrop(false), 150)}
              onChange={(e) => {
                const val = e.target.value
                setFilterSub(true)
                setShowSubDrop(true)
                setSubLabel(val)
                const exact = subCats.find(
                  (c) =>
                    toTitleCase(c.name).toLowerCase() === val.trim().toLowerCase()
                )
                if (exact) {
                  setSubId(exact.id)
                  setCreateSubName("")
                  return
                }
                setSubId("")
                setCreateSubName(val.trim())
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ui-fg-muted"
              onMouseDown={(e) => {
                e.preventDefault()
                setFilterSub(false)
                setShowSubDrop((o) => !o)
              }}
            >
              ▾
            </button>
            {showSubDrop && (
              <div className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-lg">
                {parentId && !subLabel.trim() && (
                  <button
                    type="button"
                    className="w-full border-b border-ui-border-base px-2.5 py-1.5 text-left text-xs italic text-ui-fg-muted hover:bg-ui-bg-subtle"
                    onMouseDown={() => {
                      setSubId("")
                      setSubLabel("")
                      setCreateSubName("")
                      setShowSubDrop(false)
                    }}
                  >
                    — No subcategory (use parent only)
                  </button>
                )}
                {filteredSubs.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-ui-bg-subtle"
                    onMouseDown={() => {
                      setSubId(sub.id)
                      setSubLabel(toTitleCase(sub.name))
                      setCreateSubName("")
                      setShowSubDrop(false)
                    }}
                  >
                    {toTitleCase(sub.name)}
                  </button>
                ))}
                {subLabel.trim() && !subExact && (
                  <button
                    type="button"
                    className="w-full border-t border-ui-border-base px-2.5 py-1.5 text-left text-sm text-ui-fg-interactive hover:bg-ui-bg-subtle"
                    onMouseDown={() => {
                      setCreateSubName(subLabel.trim())
                      setSubId("")
                      setShowSubDrop(false)
                    }}
                  >
                    + Create subcategory: &ldquo;{subLabel.trim()}&rdquo;
                  </button>
                )}
                {!filteredSubs.length && !subLabel.trim() && (
                  <div className="px-2.5 py-1.5 text-xs text-ui-fg-muted">
                    Type a name to create a subcategory
                  </div>
                )}
              </div>
            )}
          </div>
          {createSubName ? (
            <Text size="xsmall" className="text-amber-600">
              Will create subcategory &ldquo;{createSubName}&rdquo;
            </Text>
          ) : null}
        </div>
      )}

      <Button
        size="small"
        variant="primary"
        disabled={saving || (!dirty && !createParentName && !createSubName)}
        isLoading={saving}
        onClick={() => void handleSave()}
      >
        {saving ? "Saving…" : "Save category"}
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductCategoryEditorWidget
