/**
 * Return & Replacement Policy Widget — Product Category Details
 *
 * Embedded in the Category edit page side column.
 * Admin can set return/replacement window days per category directly here.
 * Subcategory note is shown if the category has a parent.
 */
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button, Badge, Input, Label, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

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

const CategoryReturnPolicyWidget = ({
  data,
}: { data: Record<string, any> }) => {
  const [policy, setPolicy] = useState<CategoryReturnPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [returnDays, setReturnDays] = useState("7")
  const [replacementDays, setReplacementDays] = useState("7")

  const categoryId = data?.id
  const categoryName = data?.name || ""
  const parentCategoryId =
    (data as any)?.parent_category_id ||
    (data as any)?.parent_category?.id ||
    null
  const parentCategoryName = (data as any)?.parent_category?.name || null

  const holdDays = Math.max(
    parseInt(returnDays, 10) || 0,
    parseInt(replacementDays, 10) || 0
  )

  const loadPolicy = async () => {
    if (!categoryId) return
    setLoading(true)
    try {
      const res = await fetch("/admin/return-policy", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      const found = (data.policies || []).find(
        (p: CategoryReturnPolicy) => p.category_id === categoryId
      )
      setPolicy(found || null)
      if (found) {
        setReturnDays(String(found.return_window_days))
        setReplacementDays(String(found.replacement_window_days))
      } else {
        setReturnDays("7")
        setReplacementDays("7")
      }
    } catch {
      // table may not exist yet — that's fine
      setPolicy(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPolicy()
  }, [categoryId])

  const handleSave = async () => {
    const rDays = Number(returnDays)
    const repDays = Number(replacementDays)

    if (!returnDays.trim() || !Number.isInteger(rDays) || rDays < 0 || rDays > 365) {
      toast.error("Return window must be 0–365 days")
      return
    }
    if (!replacementDays.trim() || !Number.isInteger(repDays) || repDays < 0 || repDays > 365) {
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
          category_id: categoryId,
          category_name: categoryName,
          parent_category_id: parentCategoryId,
          parent_category_name: parentCategoryName,
          return_window_days: rDays,
          replacement_window_days: repDays,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || "Failed to save")
      toast.success("Return policy saved")
      setPolicy(json.policy)
      setEditing(false)
    } catch (e: any) {
      toast.error(e.message || "Failed to save policy")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!policy) return
    if (!confirm("Remove the custom return policy for this category? It will fall back to the parent category or default (7 days).")) return
    setDeleting(true)
    try {
      const res = await fetch("/admin/return-policy", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.message || "Failed to delete")
      }
      toast.success("Policy removed — now using default or parent policy")
      setPolicy(null)
      setReturnDays("7")
      setReplacementDays("7")
      setEditing(false)
    } catch (e: any) {
      toast.error(e.message || "Failed to remove policy")
    } finally {
      setDeleting(false)
    }
  }

  const startEdit = () => {
    if (policy) {
      setReturnDays(String(policy.return_window_days))
      setReplacementDays(String(policy.replacement_window_days))
    } else {
      setReturnDays("7")
      setReplacementDays("7")
    }
    setEditing(true)
  }

  return (
    <Container className="divide-y p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Return &amp; Replacement Policy</Heading>
          <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
            Controls customer return, replacement, and vendor payout periods
          </Text>
        </div>
        {!loading && !editing && (
          <Button variant="secondary" size="small" onClick={startEdit}>
            {policy ? "Edit" : "Set Policy"}
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        {loading ? (
          <Text size="small" className="text-ui-fg-muted">Loading…</Text>
        ) : editing ? (
          /* ── Edit Form ── */
          <div className="flex flex-col gap-4">
            {parentCategoryId && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <Text size="xsmall" className="text-blue-700">
                  <strong>Subcategory policy</strong> — this will override{" "}
                  {parentCategoryName ? `"${parentCategoryName}"` : "the parent category"}'s
                  policy for returns, replacements, and vendor payouts.
                </Text>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="cat-return-days">Return window (days)</Label>
                <Input
                  id="cat-return-days"
                  type="number"
                  min="0"
                  max="365"
                  value={returnDays}
                  onChange={(e) => setReturnDays(e.target.value)}
                  placeholder="7"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="cat-replace-days">Replacement window (days)</Label>
                <Input
                  id="cat-replace-days"
                  type="number"
                  min="0"
                  max="365"
                  value={replacementDays}
                  onChange={(e) => setReplacementDays(e.target.value)}
                  placeholder="7"
                />
              </div>
            </div>

            {/* Hold preview */}
            <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Vendor payout hold after delivery:{" "}
                <strong className="text-ui-fg-base">{holdDays} days</strong>{" "}
                <span className="text-ui-fg-muted">(max of both windows)</span>
              </Text>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                {policy && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleDelete}
                    isLoading={deleting}
                    className="text-red-600"
                  >
                    Remove Policy
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleSave}
                  isLoading={saving}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : policy ? (
          /* ── Policy Summary ── */
          <div className="space-y-3">
            {parentCategoryId && (
              <Badge color="blue" size="xsmall">
                Subcategory — overrides parent policy
              </Badge>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-center">
                <p className="text-2xl font-bold text-ui-fg-base">
                  {policy.return_window_days}
                </p>
                <p className="text-xs text-ui-fg-muted">Return days</p>
              </div>
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-center">
                <p className="text-2xl font-bold text-ui-fg-base">
                  {policy.replacement_window_days}
                </p>
                <p className="text-xs text-ui-fg-muted">Replacement days</p>
              </div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <Text size="xsmall" className="text-amber-700">
                Vendor payout held for{" "}
                <strong>
                  {Math.max(
                    policy.return_window_days,
                    policy.replacement_window_days
                  )}{" "}
                  days
                </strong>{" "}
                after delivery
              </Text>
            </div>
            <Text size="xsmall" className="text-ui-fg-muted">
              Last updated:{" "}
              {new Date(policy.updated_at).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </div>
        ) : (
          /* ── No policy ── */
          <div className="space-y-3">
            {parentCategoryId && parentCategoryName && (
              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  No subcategory-specific policy set. Using{" "}
                  <strong>"{parentCategoryName}"</strong> parent policy or global
                  default.
                </Text>
              </div>
            )}
            <div className="rounded-md border border-dashed border-ui-border-base py-4 text-center">
              <Text size="small" className="text-ui-fg-muted">
                No custom policy set
              </Text>
              <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                {parentCategoryId
                  ? "Inherits from parent category or defaults to 7 days"
                  : "Defaults to 7 days"}
              </Text>
            </div>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product_category.details.side.after",
})

export default CategoryReturnPolicyWidget
