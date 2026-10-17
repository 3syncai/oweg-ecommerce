import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, Plus, Trash, PencilSquare } from "@medusajs/icons"
import {
  Container,
  Heading,
  Button,
  Badge,
  Table,
  toast,
  Input,
  Label,
  Text,
  Select,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

type CategoryReturnPolicy = {
  id: string
  category_id: string
  category_name: string
  parent_category_id: string | null
  parent_category_name: string | null
  return_window_days: number
  replacement_window_days: number
  updated_at: string
}

type ProductCategory = {
  id: string
  name: string
  parent_category_id: string | null
  parent_category?: { id: string; name: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  category_id: "",
  category_name: "",
  parent_category_id: "",
  parent_category_name: "",
  return_window_days: "7",
  replacement_window_days: "7",
}

// ─── Sub-component: Policy Form Modal ────────────────────────────────────────

const PolicyFormModal = ({
  categories,
  editing,
  onClose,
  onSaved,
}: {
  categories: ProductCategory[]
  editing: CategoryReturnPolicy | null
  onClose: () => void
  onSaved: () => void
}) => {
  const [form, setForm] = useState(() =>
    editing
      ? {
          category_id: editing.category_id,
          category_name: editing.category_name,
          parent_category_id: editing.parent_category_id || "",
          parent_category_name: editing.parent_category_name || "",
          return_window_days: String(editing.return_window_days),
          replacement_window_days: String(editing.replacement_window_days),
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)

  const selectedCat = categories.find((c) => c.id === form.category_id)

  const handleCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId)
    if (!cat) return setForm((f) => ({ ...f, category_id: catId, category_name: "" }))
    setForm((f) => ({
      ...f,
      category_id: cat.id,
      category_name: cat.name,
      parent_category_id: cat.parent_category_id || "",
      parent_category_name: cat.parent_category?.name || "",
    }))
  }

  const handleSave = async () => {
    if (!form.category_id) {
      toast.error("Please select a category")
      return
    }
    const returnDays = Number(form.return_window_days)
    const replaceDays = Number(form.replacement_window_days)
    if (!form.return_window_days.trim() || !Number.isInteger(returnDays) || returnDays < 0 || returnDays > 365) {
      toast.error("Return window must be 0–365 days")
      return
    }
    if (!form.replacement_window_days.trim() || !Number.isInteger(replaceDays) || replaceDays < 0 || replaceDays > 365) {
      toast.error("Replacement window must be 0–365 days")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/admin/return-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category_id: form.category_id,
          category_name: form.category_name,
          parent_category_id: form.parent_category_id || null,
          parent_category_name: form.parent_category_name || null,
          return_window_days: returnDays,
          replacement_window_days: replaceDays,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to save")
      toast.success(editing ? "Policy updated" : "Policy created")
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e.message || "Failed to save policy")
    } finally {
      setSaving(false)
    }
  }

  // Group categories for the select: top-level first then subcategories
  const topLevel = categories.filter((c) => !c.parent_category_id)
  const subCategories = categories.filter((c) => !!c.parent_category_id)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-ui-border-base px-5 py-4">
          <Heading level="h2">
            {editing ? "Edit Return Policy" : "Add Return Policy"}
          </Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Set return &amp; replacement window for a category. Subcategory rules
            override parent category rules.
          </Text>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-5 py-5">
          {/* Category selector */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-category">Category *</Label>
            {editing ? (
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm">
                <span className="font-medium">{editing.category_name}</span>
                {editing.parent_category_name && (
                  <span className="ml-2 text-xs text-ui-fg-muted">
                    (under {editing.parent_category_name})
                  </span>
                )}
              </div>
            ) : (
              <select
                id="rp-category"
                value={form.category_id}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ui-border-interactive"
              >
                <option value="">— Select a category —</option>
                {topLevel.length > 0 && (
                  <optgroup label="Top-level categories">
                    {topLevel.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {subCategories.length > 0 && (
                  <optgroup label="Subcategories">
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parent_category?.name
                          ? `${c.parent_category.name} › ${c.name}`
                          : c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            {selectedCat?.parent_category_id && (
              <Text size="xsmall" className="text-ui-fg-muted">
                ✓ This is a subcategory — its policy will override the parent
                category policy.
              </Text>
            )}
          </div>

          {/* Return window */}
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="rp-return">Return window (days)</Label>
              <Input
                id="rp-return"
                type="number"
                min="0"
                max="365"
                value={form.return_window_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, return_window_days: e.target.value }))
                }
                placeholder="7"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="rp-replace">Replacement window (days)</Label>
              <Input
                id="rp-replace"
                type="number"
                min="0"
                max="365"
                value={form.replacement_window_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, replacement_window_days: e.target.value }))
                }
                placeholder="7"
              />
            </div>
          </div>

          {/* Hold days preview */}
          {(form.return_window_days || form.replacement_window_days) && (
            <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2.5">
              <Text size="small" className="text-ui-fg-subtle">
                Vendor payout hold:{" "}
                <strong className="text-ui-fg-base">
                  {Math.max(
                    parseInt(form.return_window_days, 10) || 0,
                    parseInt(form.replacement_window_days, 10) || 0
                  )}{" "}
                  days
                </strong>{" "}
                after delivery (max of both windows)
              </Text>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-ui-border-base px-5 py-4">
          <Button variant="secondary" size="small" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            isLoading={saving}
          >
            {editing ? "Update Policy" : "Save Policy"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReturnPolicyPage = () => {
  const [policies, setPolicies] = useState<CategoryReturnPolicy[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryReturnPolicy | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [policiesRes, categoriesRes] = await Promise.all([
        fetch("/admin/return-policy", { credentials: "include" }),
        fetch(
          "/admin/product-categories?fields=id,name,parent_category_id,parent_category.id,parent_category.name&limit=500",
          { credentials: "include" }
        ),
      ])

      if (policiesRes.ok) {
        const data = await policiesRes.json()
        setPolicies(data.policies || [])
      }

      if (categoriesRes.ok) {
        const data = await categoriesRes.json()
        setCategories(data.product_categories || [])
      }
    } catch (e) {
      toast.error("Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (policy: CategoryReturnPolicy) => {
    if (!confirm(`Remove return policy for "${policy.category_name}"?`)) return
    setDeletingId(policy.category_id)
    try {
      const res = await fetch("/admin/return-policy", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category_id: policy.category_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message)
      toast.success("Policy removed")
      await load()
    } catch (e: any) {
      toast.error(e.message || "Failed to delete policy")
    } finally {
      setDeletingId(null)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (p: CategoryReturnPolicy) => {
    setEditing(p)
    setFormOpen(true)
  }

  // Group policies: parent categories first, then subcategories indented
  const topPolicies = policies.filter((p) => !p.parent_category_id)
  const subPolicies = policies.filter((p) => !!p.parent_category_id)

  // Build a quick lookup: parentCategoryId → policies[]
  const subByParent = new Map<string, CategoryReturnPolicy[]>()
  for (const sp of subPolicies) {
    const list = subByParent.get(sp.parent_category_id!) || []
    list.push(sp)
    subByParent.set(sp.parent_category_id!, list)
  }

  // Flat ordered list for table: top-level then each one's subcategories
  const orderedPolicies: (CategoryReturnPolicy & { isSubcat: boolean })[] = []
  for (const tp of topPolicies) {
    orderedPolicies.push({ ...tp, isSubcat: false })
    const subs = subByParent.get(tp.category_id) || []
    for (const sp of subs) {
      orderedPolicies.push({ ...sp, isSubcat: true })
    }
    subByParent.delete(tp.category_id)
  }
  // remaining subcategories whose parent has no top-level policy
  for (const remaining of subByParent.values()) {
    for (const sp of remaining) {
      orderedPolicies.push({ ...sp, isSubcat: true })
    }
  }

  return (
    <Container>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Heading level="h1">Return &amp; Replacement Policy</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Configure the return and replacement duration per product category.
            These durations determine how long the vendor payout is held after
            delivery. Subcategory policies override parent category policies.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="small" onClick={load}>
            <ArrowPath className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="primary" size="small" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Policy
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-5 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          <strong className="text-ui-fg-base">How it works:</strong> When a
          vendor order is delivered, the payout is held for{" "}
          <strong>max(return_window, replacement_window)</strong> days. The most
          specific matching policy wins:{" "}
          <span className="text-blue-600">Subcategory</span> →{" "}
          <span className="text-indigo-600">Parent category</span> → Product
          metadata → Default (7 days).
        </Text>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Text className="text-ui-fg-muted">Loading policies…</Text>
        </div>
      ) : orderedPolicies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ui-border-base py-16 text-center">
          <Text className="text-ui-fg-muted">
            No category policies configured yet.
          </Text>
          <Text size="small" className="mt-1 text-ui-fg-muted">
            Click <strong>Add Policy</strong> to set a return/replacement window
            for a category.
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Category</Table.HeaderCell>
              <Table.HeaderCell>Parent Category</Table.HeaderCell>
              <Table.HeaderCell>Return Window</Table.HeaderCell>
              <Table.HeaderCell>Replacement Window</Table.HeaderCell>
              <Table.HeaderCell>Payout Hold</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {orderedPolicies.map((policy) => {
              const holdDays = Math.max(
                Number(policy.return_window_days),
                Number(policy.replacement_window_days)
              )
              return (
                <Table.Row key={policy.category_id}>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      {policy.isSubcat && (
                        <span className="text-ui-fg-muted">↳</span>
                      )}
                      <div>
                        <p className="font-medium">{policy.category_name}</p>
                        {policy.isSubcat && (
                          <Badge color="blue" size="xsmall">
                            subcategory
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {policy.parent_category_name ? (
                      <span className="text-sm text-ui-fg-subtle">
                        {policy.parent_category_name}
                      </span>
                    ) : (
                      <span className="text-xs text-ui-fg-muted">—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-sm">
                      {policy.return_window_days}{" "}
                      <span className="text-xs text-ui-fg-muted">days</span>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-sm">
                      {policy.replacement_window_days}{" "}
                      <span className="text-xs text-ui-fg-muted">days</span>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={holdDays >= 14 ? "orange" : holdDays >= 7 ? "blue" : "green"}
                    >
                      {holdDays}d hold
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => openEdit(policy)}
                      >
                        <PencilSquare className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleDelete(policy)}
                        isLoading={deletingId === policy.category_id}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}

      {/* Categories with no custom policy yet */}
      {!loading && categories.length > 0 && (
        <div className="mt-6">
          <Text size="small" weight="plus" className="mb-2 text-ui-fg-subtle">
            Categories without a policy (using default 7-day hold or product
            metadata)
          </Text>
          <div className="flex flex-wrap gap-2">
            {categories
              .filter(
                (c) => !policies.some((p) => p.category_id === c.id)
              )
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setEditing(null)
                    const cat = categories.find((x) => x.id === c.id)
                    if (cat) {
                      setFormOpen(true)
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-ui-border-base bg-ui-bg-base px-2.5 py-0.5 text-xs text-ui-fg-subtle transition-colors hover:border-ui-border-strong hover:bg-ui-bg-subtle"
                >
                  <Plus className="h-3 w-3" />
                  {c.parent_category?.name
                    ? `${c.parent_category.name} › ${c.name}`
                    : c.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {formOpen && (
        <PolicyFormModal
          categories={categories}
          editing={editing}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSaved={load}
        />
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Return Policy",
})

export default ReturnPolicyPage
