"use client"

import { useMemo, useState } from "react"
import { Label, Text } from "@medusajs/ui"

export type CategoryOption = {
  id: string
  name: string
  parent_category_id?: string | null
}

export type CategorySubcategoryValue = {
  categoryId: string
  categoryRequest: string
  parentId: string
  parentLabel: string
  subLabel: string
  requestedParentName: string
}

type Props = {
  categories: CategoryOption[]
  value: CategorySubcategoryValue
  onChange: (next: CategorySubcategoryValue) => void
  optional?: boolean
}

const toTitleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ""

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-ui-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Searchable category + subcategory combobox used on create & edit product.
 * Vendors can pick an existing value or type a new name to request from admin.
 */
export default function CategorySubcategoryPicker({
  categories,
  value,
  onChange,
  optional = true,
}: Props) {
  const [showParentDrop, setShowParentDrop] = useState(false)
  const [showSubDrop, setShowSubDrop] = useState(false)
  /** When false, open dropdown shows the full list even if a value is selected. */
  const [filterParent, setFilterParent] = useState(false)
  const [filterSub, setFilterSub] = useState(false)

  const rootCats = useMemo(
    () => categories.filter((c) => !c.parent_category_id),
    [categories]
  )
  const selectedParent = categories.find((c) => c.id === value.parentId)
  const subCats = value.parentId
    ? categories.filter((c) => c.parent_category_id === value.parentId)
    : []

  const parentQuery = filterParent ? value.parentLabel.trim().toLowerCase() : ""
  const filteredParents = rootCats.filter((c) =>
    toTitleCase(c.name).toLowerCase().includes(parentQuery)
  )
  const subQuery = filterSub ? value.subLabel.trim().toLowerCase() : ""
  const filteredSubs = subCats.filter((c) => {
    const name = toTitleCase(c.name).toLowerCase()
    if (!subQuery) return true
    return name.startsWith(subQuery) || name.includes(subQuery)
  })

  const parentMatchesExact = rootCats.some(
    (c) => toTitleCase(c.name).toLowerCase() === value.parentLabel.trim().toLowerCase()
  )
  const subMatchesExact = subCats.some(
    (c) => toTitleCase(c.name).toLowerCase() === value.subLabel.trim().toLowerCase()
  )

  const emit = (patch: Partial<CategorySubcategoryValue>) => {
    onChange({ ...value, ...patch })
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-ui-border-base bg-ui-bg-base py-2 pl-3 pr-9 text-sm text-ui-fg-base outline-none transition focus:border-ui-fg-interactive"

  return (
    <div>
      <Label>
        Category {optional ? <span className="text-ui-fg-muted">(Optional)</span> : null}
      </Label>
      <Text size="small" className="mb-1 text-ui-fg-muted">
        Select existing or type to request a new one
      </Text>

      {/* Parent category */}
      <div className="relative mb-2">
        <input
          type="text"
          value={value.parentLabel}
          placeholder="Search or type parent category…"
          autoComplete="off"
          onFocus={() => {
            setShowParentDrop(true)
            setFilterParent(false)
          }}
          onBlur={() => setTimeout(() => setShowParentDrop(false), 150)}
          onChange={(e) => {
            const next = e.target.value
            setFilterParent(true)
            setShowParentDrop(true)
            emit({
              parentLabel: next,
              parentId: "",
              requestedParentName: "",
              subLabel: "",
              categoryId: "",
              categoryRequest: "",
            })
          }}
          className={inputClass}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle category list"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-ui-bg-subtle"
          onMouseDown={(e) => {
            e.preventDefault()
            setFilterParent(false)
            setShowParentDrop((open) => !open)
          }}
        >
          <Chevron open={showParentDrop} />
        </button>

        {showParentDrop && (
          <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-base shadow-lg">
            {filteredParents.length === 0 && !value.parentLabel.trim() && (
              <div className="px-3 py-2 text-sm text-ui-fg-muted">No categories yet</div>
            )}
            {filteredParents.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-ui-bg-subtle"
                onMouseDown={() => {
                  setShowParentDrop(false)
                  setFilterParent(false)
                  emit({
                    parentId: cat.id,
                    parentLabel: toTitleCase(cat.name),
                    requestedParentName: "",
                    subLabel: "",
                    categoryId: cat.id,
                    categoryRequest: "",
                  })
                }}
              >
                {toTitleCase(cat.name)}
              </button>
            ))}
            {value.parentLabel.trim() && !parentMatchesExact && (
              <button
                type="button"
                className="w-full border-t border-ui-border-base px-3 py-2 text-left text-sm text-ui-fg-interactive transition-colors hover:bg-ui-bg-subtle"
                onMouseDown={() => {
                  const name = value.parentLabel.trim()
                  setShowParentDrop(false)
                  setFilterParent(false)
                  emit({
                    parentId: "",
                    parentLabel: name,
                    requestedParentName: name,
                    subLabel: "",
                    categoryId: "",
                    categoryRequest: name,
                  })
                }}
              >
                + Request new: &ldquo;{value.parentLabel.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Subcategory */}
      {(value.parentId || value.requestedParentName) && (
        <div className="relative">
          <div className="mb-1 flex items-center gap-1">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Subcategory under{" "}
              <span className="font-medium">
                {selectedParent
                  ? toTitleCase(selectedParent.name)
                  : value.requestedParentName}
              </span>
              {value.requestedParentName ? (
                <span className="ml-1 text-amber-500">(new — will be requested)</span>
              ) : null}
            </Text>
            {value.subLabel ? (
              <button
                type="button"
                className="ml-auto text-xs text-ui-fg-muted hover:text-ui-fg-subtle"
                onClick={() => {
                  if (value.parentId) {
                    emit({
                      subLabel: "",
                      categoryId: value.parentId,
                      categoryRequest: "",
                    })
                  } else {
                    emit({
                      subLabel: "",
                      categoryId: "",
                      categoryRequest: value.requestedParentName,
                    })
                  }
                }}
              >
                ✕ clear
              </button>
            ) : null}
          </div>
          <div className="relative">
            <input
              type="text"
              value={value.subLabel}
              placeholder={
                subCats.length > 0 ? "Search subcategory…" : "Type a subcategory name…"
              }
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onFocus={() => {
                setShowSubDrop(true)
                setFilterSub(false)
              }}
              onBlur={() => setTimeout(() => setShowSubDrop(false), 150)}
              onChange={(e) => {
                const val = e.target.value
                setFilterSub(true)
                setShowSubDrop(true)
                const exact = subCats.find(
                  (c) => toTitleCase(c.name).toLowerCase() === val.trim().toLowerCase()
                )
                if (exact) {
                  emit({
                    subLabel: val,
                    categoryId: exact.id,
                    categoryRequest: "",
                  })
                  return
                }
                const trimmed = val.trim()
                if (!trimmed) {
                  if (value.parentId) {
                    emit({
                      subLabel: val,
                      categoryId: value.parentId,
                      categoryRequest: "",
                    })
                  } else {
                    emit({
                      subLabel: val,
                      categoryId: "",
                      categoryRequest: value.requestedParentName,
                    })
                  }
                  return
                }
                const parentLabel = selectedParent
                  ? toTitleCase(selectedParent.name)
                  : value.requestedParentName
                emit({
                  subLabel: val,
                  categoryId: "",
                  categoryRequest: `${parentLabel} > ${trimmed}`,
                })
              }}
              className={inputClass}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle subcategory list"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-ui-bg-subtle"
              onMouseDown={(e) => {
                e.preventDefault()
                setFilterSub(false)
                setShowSubDrop((open) => !open)
              }}
            >
              <Chevron open={showSubDrop} />
            </button>

            {showSubDrop && (
              <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-base shadow-lg">
                {value.parentId && !value.subLabel.trim() && (
                  <button
                    type="button"
                    className="w-full border-b border-ui-border-base px-3 py-2 text-left text-xs italic text-ui-fg-muted transition-colors hover:bg-ui-bg-subtle"
                    onMouseDown={() => {
                      setShowSubDrop(false)
                      emit({
                        subLabel: "",
                        categoryId: value.parentId,
                        categoryRequest: "",
                      })
                    }}
                  >
                    — No subcategory (use {toTitleCase(selectedParent?.name || "")} directly)
                  </button>
                )}
                {filteredSubs.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-ui-bg-subtle"
                    onMouseDown={() => {
                      setShowSubDrop(false)
                      setFilterSub(false)
                      emit({
                        subLabel: toTitleCase(sub.name),
                        categoryId: sub.id,
                        categoryRequest: "",
                      })
                    }}
                  >
                    {toTitleCase(sub.name)}
                  </button>
                ))}
                {!value.subLabel.trim() && subCats.length === 0 && (
                  <div className="px-3 py-2 text-xs italic text-ui-fg-muted">
                    Type a subcategory name to request it
                  </div>
                )}
                {value.subLabel.trim() && !subMatchesExact && (
                  <div className="border-t border-ui-border-base px-3 py-2 text-xs text-amber-700">
                    Will request:{" "}
                    {selectedParent
                      ? toTitleCase(selectedParent.name)
                      : value.requestedParentName}{" "}
                    › {value.subLabel.trim()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {value.categoryId ? (
        <Text size="small" className="mt-1 text-green-700">
          ✓{" "}
          {toTitleCase(categories.find((c) => c.id === value.categoryId)?.name || "")}
        </Text>
      ) : null}
      {value.categoryRequest && !value.categoryId ? (
        <Text size="small" className="mt-1 text-amber-600">
          Requesting: &ldquo;{value.categoryRequest}&rdquo;
        </Text>
      ) : null}
    </div>
  )
}

export function buildCategoryPickerValue(
  categories: CategoryOption[],
  categoryId: string,
  categoryRequest = ""
): CategorySubcategoryValue {
  if (!categoryId) {
    return {
      categoryId: "",
      categoryRequest,
      parentId: "",
      parentLabel: categoryRequest.includes(">")
        ? categoryRequest.split(">")[0].trim()
        : categoryRequest,
      subLabel: categoryRequest.includes(">")
        ? categoryRequest.split(">").slice(1).join(">").trim()
        : "",
      requestedParentName: categoryRequest && !categoryRequest.includes(">")
        ? categoryRequest
        : categoryRequest.includes(">")
          ? categoryRequest.split(">")[0].trim()
          : "",
    }
  }
  const selected = categories.find((c) => c.id === categoryId)
  if (!selected) {
    return {
      categoryId,
      categoryRequest: "",
      parentId: "",
      parentLabel: "",
      subLabel: "",
      requestedParentName: "",
    }
  }
  if (selected.parent_category_id) {
    const parent = categories.find((c) => c.id === selected.parent_category_id)
    return {
      categoryId,
      categoryRequest: "",
      parentId: parent?.id || selected.parent_category_id,
      parentLabel: parent?.name ? toTitleCase(parent.name) : "",
      subLabel: toTitleCase(selected.name),
      requestedParentName: "",
    }
  }
  return {
    categoryId,
    categoryRequest: "",
    parentId: selected.id,
    parentLabel: toTitleCase(selected.name),
    subLabel: "",
    requestedParentName: "",
  }
}
