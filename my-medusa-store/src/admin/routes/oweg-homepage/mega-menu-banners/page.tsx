"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { Plus, Trash } from "@medusajs/icons"
import { getAdminBackendUrl, readAdminApiError } from "../../../lib/admin-backend"

const PARENT_REDIRECT_VALUE = "__parent__"

type MegaMenuRedirectTarget = "parent" | "subcategory"

type SubcategoryRow = {
  id: string
  name: string
  handle: string
}

type MegaMenuBannerRow = {
  id: string
  image_url: string
  s3_key: string
  link_url: string
  priority: number
  enabled: boolean
  alt_text: string
  open_in_new_tab: boolean
  redirect_target: MegaMenuRedirectTarget
  subcategory_handle: string
  subcategory_name: string
  redirect_label: string
  updated_at: string
}

type CategoryRow = {
  id: string
  name: string
  handle: string
  banners: MegaMenuBannerRow[]
  banner_count: number
  enabled_banner_count: number
}

type NewBannerForm = {
  redirect_selection: string
  priority: string
  alt_text: string
  enabled: boolean
  open_in_new_tab: boolean
}

const defaultNewBannerForm = (): NewBannerForm => ({
  redirect_selection: PARENT_REDIRECT_VALUE,
  priority: "10",
  alt_text: "",
  enabled: true,
  open_in_new_tab: false,
})

function redirectSelectionToPayload(selection: string): {
  redirect_target: MegaMenuRedirectTarget
  subcategory_handle: string
} {
  if (selection === PARENT_REDIRECT_VALUE) {
    return { redirect_target: "parent", subcategory_handle: "" }
  }
  return { redirect_target: "subcategory", subcategory_handle: selection }
}

function bannerToRedirectSelection(banner: MegaMenuBannerRow): string {
  if (banner.redirect_target === "subcategory" && banner.subcategory_handle) {
    return banner.subcategory_handle
  }
  return PARENT_REDIRECT_VALUE
}

const MegaMenuBannersPage = () => {
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])
  const [loadingSubcategories, setLoadingSubcategories] = useState(false)
  const [search, setSearch] = useState("")
  const [savingBannerId, setSavingBannerId] = useState<string | null>(null)
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newBanner, setNewBanner] = useState<NewBannerForm>(defaultNewBannerForm())
  const createFileRef = useRef<HTMLInputElement | null>(null)
  const reuploadInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const patchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(`${backend}/admin/mega-menu-banners`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to load categories"))
      }
      const data = await res.json()
      const rows = (data.categories || []) as CategoryRow[]
      setCategories(rows)
      setSelectedCategoryId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev
        return rows[0]?.id || ""
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to load mega menu banners"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSubcategories = useCallback(async (categoryId: string) => {
    if (!categoryId) {
      setSubcategories([])
      return
    }

    setLoadingSubcategories(true)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(`${backend}/admin/mega-menu-banners/${categoryId}/subcategories`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to load subcategories"))
      }
      const data = await res.json()
      setSubcategories((data.subcategories || []) as SubcategoryRow[])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to load subcategories"
      toast.error(message)
      setSubcategories([])
    } finally {
      setLoadingSubcategories(false)
    }
  }, [])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    if (selectedCategoryId) {
      void loadSubcategories(selectedCategoryId)
    } else {
      setSubcategories([])
    }
  }, [selectedCategoryId, loadSubcategories])

  useEffect(() => {
    return () => {
      Object.values(patchTimers.current).forEach(clearTimeout)
    }
  }, [])

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (row) => row.name.toLowerCase().includes(q) || row.handle.toLowerCase().includes(q)
    )
  }, [categories, search])

  const selectedCategory = useMemo(
    () => categories.find((row) => row.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  )

  const parentRedirectLabel = selectedCategory
    ? `All ${selectedCategory.name}`
    : "Parent category page"

  const replaceCategory = (updated: CategoryRow) => {
    setCategories((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
  }

  const patchBanner = async (
    bannerId: string,
    patch: Partial<
      Pick<
        MegaMenuBannerRow,
        | "redirect_target"
        | "subcategory_handle"
        | "priority"
        | "enabled"
        | "alt_text"
        | "open_in_new_tab"
      >
    >
  ) => {
    if (!selectedCategory) return
    setSavingBannerId(bannerId)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(
        `${backend}/admin/mega-menu-banners/${selectedCategory.id}/banners/${bannerId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      )
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to save banner"))
      }
      const data = await res.json()
      replaceCategory(data.category as CategoryRow)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed"
      toast.error(message)
      throw err
    } finally {
      setSavingBannerId(null)
    }
  }

  const schedulePatch = (
    bannerId: string,
    patch: Partial<
      Pick<
        MegaMenuBannerRow,
        | "redirect_target"
        | "subcategory_handle"
        | "priority"
        | "enabled"
        | "alt_text"
        | "open_in_new_tab"
      >
    >
  ) => {
    clearTimeout(patchTimers.current[bannerId])
    patchTimers.current[bannerId] = setTimeout(() => {
      void patchBanner(bannerId, patch)
    }, 600)
  }

  const handleCreateBanner = async (file: File) => {
    if (!selectedCategory) return

    setCreating(true)
    try {
      const backend = getAdminBackendUrl()
      const redirectPayload = redirectSelectionToPayload(newBanner.redirect_selection)
      const form = new FormData()
      form.append("file", file)
      form.append("redirect_target", redirectPayload.redirect_target)
      form.append("subcategory_handle", redirectPayload.subcategory_handle)
      form.append("priority", newBanner.priority || "10")
      form.append("alt_text", newBanner.alt_text)
      form.append("enabled", String(newBanner.enabled))
      form.append("open_in_new_tab", String(newBanner.open_in_new_tab))

      const res = await fetch(
        `${backend}/admin/mega-menu-banners/${selectedCategory.id}/banners`,
        {
          method: "POST",
          credentials: "include",
          body: form,
        }
      )
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to create banner"))
      }
      const data = await res.json()
      replaceCategory(data.category as CategoryRow)
      setNewBanner(defaultNewBannerForm())
      if (createFileRef.current) createFileRef.current.value = ""
      toast.success("Banner created")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Create failed"
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  const handleRedirectChange = (banner: MegaMenuBannerRow, selection: string) => {
    if (!selectedCategory) return
    const payload = redirectSelectionToPayload(selection)
    const subcategoryName =
      payload.redirect_target === "subcategory"
        ? subcategories.find((sub) => sub.handle === payload.subcategory_handle)?.name ||
          banner.subcategory_name
        : ""

    replaceCategory({
      ...selectedCategory,
      banners: selectedCategory.banners.map((item) =>
        item.id === banner.id
          ? {
              ...item,
              redirect_target: payload.redirect_target,
              subcategory_handle: payload.subcategory_handle,
              subcategory_name: subcategoryName,
              redirect_label:
                payload.redirect_target === "parent"
                  ? parentRedirectLabel
                  : subcategoryName || item.redirect_label,
            }
          : item
      ),
    })

    void patchBanner(banner.id, payload)
  }

  const handleReupload = async (banner: MegaMenuBannerRow, file: File) => {
    if (!selectedCategory) return
    setUploadingBannerId(banner.id)
    try {
      const backend = getAdminBackendUrl()
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(
        `${backend}/admin/mega-menu-banners/${selectedCategory.id}/banners/${banner.id}/image`,
        {
          method: "POST",
          credentials: "include",
          body: form,
        }
      )
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Reupload failed"))
      }
      const data = await res.json()
      replaceCategory(data.category as CategoryRow)
      toast.success("Banner image updated")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Reupload failed"
      toast.error(message)
    } finally {
      setUploadingBannerId(null)
    }
  }

  const handleDelete = async (banner: MegaMenuBannerRow) => {
    if (!selectedCategory) return
    const confirmed = window.confirm(`Delete banner for ${selectedCategory.name}?`)
    if (!confirmed) return

    setSavingBannerId(banner.id)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(
        `${backend}/admin/mega-menu-banners/${selectedCategory.id}/banners/${banner.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Delete failed"))
      }
      const data = await res.json()
      replaceCategory(data.category as CategoryRow)
      toast.success("Banner deleted")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed"
      toast.error(message)
    } finally {
      setSavingBannerId(null)
    }
  }

  const renderRedirectSelect = (
    value: string,
    onChange: (next: string) => void,
    disabled?: boolean,
    id?: string
  ) => (
    <Select value={value} onValueChange={onChange} disabled={disabled || loadingSubcategories}>
      <Select.Trigger id={id}>
        <Select.Value placeholder="Select redirect destination" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={PARENT_REDIRECT_VALUE}>{parentRedirectLabel}</Select.Item>
        {subcategories.map((sub) => (
          <Select.Item key={sub.id} value={sub.handle}>
            {sub.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-6">
        <div className="flex flex-col gap-y-2">
          <Heading level="h1">Mega Menu Banners</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Upload clickable category banners for the header mega menu. Choose a redirect destination
            (parent category or subcategory). Files are stored on S3 at
            headercategorybanner/&#123;category-name&#125;/&#123;image&#125;.
          </Text>
          <div className="flex items-center gap-2">
            <Badge>{categories.length} categories</Badge>
            {selectedCategory ? (
              <Badge color="green">{selectedCategory.enabled_banner_count} enabled in selected</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="category-search">Search categories</Label>
            <Input
              id="category-search"
              placeholder="Search by name or handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="category-select">Category</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
              disabled={loading || filteredCategories.length === 0}
            >
              <Select.Trigger id="category-select">
                <Select.Value placeholder="Select category" />
              </Select.Trigger>
              <Select.Content>
                {filteredCategories.map((row) => (
                  <Select.Item key={row.id} value={row.id}>
                    {row.name} ({row.banner_count} banners)
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        {loading ? (
          <Text>Loading categories...</Text>
        ) : !selectedCategory ? (
          <Text>No categories found.</Text>
        ) : (
          <>
            <div className="rounded-lg border border-ui-border-base p-4">
              <Heading level="h2">Add banner — {selectedCategory.name}</Heading>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="new-redirect">Redirect to</Label>
                  {renderRedirectSelect(
                    newBanner.redirect_selection,
                    (next) => setNewBanner((prev) => ({ ...prev, redirect_selection: next })),
                    creating,
                    "new-redirect"
                  )}
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {loadingSubcategories
                      ? "Loading subcategories..."
                      : `${subcategories.length} subcategories available`}
                  </Text>
                </div>
                <div>
                  <Label htmlFor="new-priority">Priority (lower first)</Label>
                  <Input
                    id="new-priority"
                    type="number"
                    value={newBanner.priority}
                    onChange={(e) =>
                      setNewBanner((prev) => ({ ...prev, priority: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new-alt">Alt text</Label>
                  <Input
                    id="new-alt"
                    value={newBanner.alt_text}
                    onChange={(e) =>
                      setNewBanner((prev) => ({ ...prev, alt_text: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center gap-6 pt-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newBanner.enabled}
                      onCheckedChange={(checked) =>
                        setNewBanner((prev) => ({ ...prev, enabled: checked }))
                      }
                    />
                    <Text size="small">Enabled</Text>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newBanner.open_in_new_tab}
                      onCheckedChange={(checked) =>
                        setNewBanner((prev) => ({ ...prev, open_in_new_tab: checked }))
                      }
                    />
                    <Text size="small">Open in new tab</Text>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Opens in a new browser tab using a standard link (works in Chrome/Edge and
                    the installed desktop app).
                  </Text>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleCreateBanner(file)
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={creating || loadingSubcategories}
                    onClick={() => createFileRef.current?.click()}
                  >
                    <Plus />
                    Upload & Create Banner
                  </Button>
                </div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Recommended banner size: 793 × 1983 px (2:5 vertical). Images are scaled to fit
                  the mega menu promo column.
                </Text>
              </div>
            </div>

            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Preview</Table.HeaderCell>
                  <Table.HeaderCell>Priority</Table.HeaderCell>
                  <Table.HeaderCell>Redirect to</Table.HeaderCell>
                  <Table.HeaderCell>Alt text</Table.HeaderCell>
                  <Table.HeaderCell>Enabled</Table.HeaderCell>
                  <Table.HeaderCell>New tab</Table.HeaderCell>
                  <Table.HeaderCell>S3 key</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {selectedCategory.banners.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle">
                        No banners for this category yet.
                      </Text>
                    </Table.Cell>
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                    <Table.Cell />
                  </Table.Row>
                ) : (
                  selectedCategory.banners.map((banner) => (
                    <Table.Row key={banner.id}>
                      <Table.Cell>
                        {banner.image_url ? (
                          <img
                            src={banner.image_url}
                            alt={banner.alt_text || selectedCategory.name}
                            className="h-14 w-24 rounded border border-ui-border-base object-cover"
                          />
                        ) : (
                          <Text size="small">No image</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          value={String(banner.priority)}
                          disabled={savingBannerId === banner.id}
                          onChange={(e) => {
                            const next = Number(e.target.value)
                            replaceCategory({
                              ...selectedCategory,
                              banners: selectedCategory.banners.map((item) =>
                                item.id === banner.id ? { ...item, priority: next } : item
                              ),
                            })
                            schedulePatch(banner.id, { priority: next })
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="min-w-[220px]">
                          {renderRedirectSelect(
                            bannerToRedirectSelection(banner),
                            (next) => handleRedirectChange(banner, next),
                            savingBannerId === banner.id,
                            `redirect-${banner.id}`
                          )}
                          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                            {banner.link_url || "—"}
                          </Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          value={banner.alt_text}
                          disabled={savingBannerId === banner.id}
                          onChange={(e) => {
                            const next = e.target.value
                            replaceCategory({
                              ...selectedCategory,
                              banners: selectedCategory.banners.map((item) =>
                                item.id === banner.id ? { ...item, alt_text: next } : item
                              ),
                            })
                            schedulePatch(banner.id, { alt_text: next })
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Switch
                          checked={banner.enabled}
                          disabled={savingBannerId === banner.id}
                          onCheckedChange={(checked) => {
                            replaceCategory({
                              ...selectedCategory,
                              banners: selectedCategory.banners.map((item) =>
                                item.id === banner.id ? { ...item, enabled: checked } : item
                              ),
                            })
                            void patchBanner(banner.id, { enabled: checked })
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Switch
                          checked={banner.open_in_new_tab}
                          disabled={savingBannerId === banner.id}
                          onCheckedChange={(checked) => {
                            replaceCategory({
                              ...selectedCategory,
                              banners: selectedCategory.banners.map((item) =>
                                item.id === banner.id
                                  ? { ...item, open_in_new_tab: checked }
                                  : item
                              ),
                            })
                            void patchBanner(banner.id, { open_in_new_tab: checked })
                          }}
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="xsmall" className="text-ui-fg-subtle break-all">
                          {banner.s3_key || "—"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(el) => {
                              reuploadInputs.current[banner.id] = el
                            }}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) void handleReupload(banner, file)
                              e.target.value = ""
                            }}
                          />
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={uploadingBannerId === banner.id}
                            onClick={() => reuploadInputs.current[banner.id]?.click()}
                          >
                            Reupload
                          </Button>
                          <Button
                            size="small"
                            variant="danger"
                            disabled={savingBannerId === banner.id}
                            onClick={() => void handleDelete(banner)}
                          >
                            <Trash />
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Mega Menu Banners",
})

export default MegaMenuBannersPage
