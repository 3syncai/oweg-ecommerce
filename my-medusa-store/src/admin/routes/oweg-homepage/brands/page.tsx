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
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { Plus, Trash } from "@medusajs/icons"
import { getAdminBackendUrl, readAdminApiError } from "../../../lib/admin-backend"

type FeaturedBrandRow = {
  id: string
  title: string
  handle: string
  featured_on_homepage: boolean
  homepage_rank: number
  brand_logo_url: string
  brand_logo_s3_key: string
  brand_logo_scale: number
}

const clampBrandLogoScale = (scale?: number) => {
  const parsed = typeof scale === "number" && Number.isFinite(scale) ? scale : 1
  return Math.min(3, Math.max(0.25, parsed))
}

const BrandLogoPreview = ({
  src,
  alt,
  scale,
}: {
  src: string
  alt: string
  scale: number
}) => {
  const safeScale = clampBrandLogoScale(scale)
  const pct = Math.min(safeScale * 100, 100)

  return (
    <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded border border-ui-border-base bg-white p-1">
      <div
        className="relative flex items-center justify-center"
        style={{ width: `${pct}%`, height: `${pct}%` }}
      >
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  )
}

type PersistedBrandFields = {
  homepage_rank: number
  brand_logo_scale: number
}

const FeaturedBrandsPage = () => {
  const [loading, setLoading] = useState(true)
  const [collections, setCollections] = useState<FeaturedBrandRow[]>([])
  const [search, setSearch] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const persistedRef = useRef<Record<string, PersistedBrandFields>>({})
  const scaleSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const rankSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const syncPersistedRows = (rows: FeaturedBrandRow[]) => {
    for (const row of rows) {
      persistedRef.current[row.id] = {
        homepage_rank: row.homepage_rank,
        brand_logo_scale: row.brand_logo_scale,
      }
    }
  }

  const loadCollections = useCallback(async () => {
    setLoading(true)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(`${backend}/admin/featured-brands`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to load collections"))
      }
      const data = await res.json()
      const rows = (data.collections || []) as FeaturedBrandRow[]
      syncPersistedRows(rows)
      setCollections(rows)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to load featured brands"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCollections()
  }, [loadCollections])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return collections
    return collections.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.handle.toLowerCase().includes(q)
    )
  }, [collections, search])

  const featuredCount = useMemo(
    () => collections.filter((row) => row.featured_on_homepage).length,
    [collections]
  )

  const patchCollection = async (
    id: string,
    patch: Partial<Pick<FeaturedBrandRow, "featured_on_homepage" | "homepage_rank" | "brand_logo_scale">>
  ) => {
    setSavingId(id)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(`${backend}/admin/featured-brands/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to save changes"))
      }
      const data = await res.json()
      const updated = data.collection as FeaturedBrandRow
      persistedRef.current[id] = {
        homepage_rank: updated.homepage_rank,
        brand_logo_scale: updated.brand_logo_scale,
      }
      setCollections((prev) => prev.map((row) => (row.id === id ? updated : row)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed"
      toast.error(message)
      throw err
    } finally {
      setSavingId(null)
    }
  }

  const saveBrandLogoScale = async (id: string, next: number) => {
    if (!Number.isFinite(next)) return
    const persisted = persistedRef.current[id]?.brand_logo_scale ?? 1
    if (next === persisted) return
    try {
      await patchCollection(id, { brand_logo_scale: next })
    } catch {
      /* toast handled */
    }
  }

  const saveHomepageRank = async (id: string, next: number) => {
    if (!Number.isFinite(next)) return
    const persisted = persistedRef.current[id]?.homepage_rank ?? 0
    if (next === persisted) return
    try {
      await patchCollection(id, { homepage_rank: next })
    } catch {
      /* toast handled */
    }
  }

  const scheduleBrandLogoScaleSave = (id: string, next: number) => {
    clearTimeout(scaleSaveTimers.current[id])
    scaleSaveTimers.current[id] = setTimeout(() => {
      void saveBrandLogoScale(id, next)
    }, 600)
  }

  const scheduleHomepageRankSave = (id: string, next: number) => {
    clearTimeout(rankSaveTimers.current[id])
    rankSaveTimers.current[id] = setTimeout(() => {
      void saveHomepageRank(id, next)
    }, 600)
  }

  useEffect(() => {
    return () => {
      Object.values(scaleSaveTimers.current).forEach(clearTimeout)
      Object.values(rankSaveTimers.current).forEach(clearTimeout)
    }
  }, [])

  const handleUpload = async (row: FeaturedBrandRow, file: File) => {
    setUploadingId(row.id)
    try {
      const backend = getAdminBackendUrl()
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${backend}/admin/featured-brands/${row.id}/logo`, {
        method: "POST",
        credentials: "include",
        body: form,
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Upload failed"))
      }
      const data = await res.json()
      const updated = data.collection as FeaturedBrandRow
      setCollections((prev) => prev.map((item) => (item.id === row.id ? updated : item)))
      toast.success(`Logo uploaded for ${row.title}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed"
      toast.error(message)
    } finally {
      setUploadingId(null)
    }
  }

  const handleRemoveLogo = async (row: FeaturedBrandRow) => {
    setUploadingId(row.id)
    try {
      const backend = getAdminBackendUrl()
      const res = await fetch(`${backend}/admin/featured-brands/${row.id}/logo`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(await readAdminApiError(res, "Failed to remove logo"))
      }
      const data = await res.json()
      const updated = data.collection as FeaturedBrandRow
      setCollections((prev) => prev.map((item) => (item.id === row.id ? updated : item)))
      toast.success(`Logo removed for ${row.title}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Remove failed"
      toast.error(message)
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-6">
        <div className="flex flex-col gap-y-2">
          <Heading level="h1">Featured Brands</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Select collections for the homepage &quot;Top brands we carry&quot; carousel and upload
            logos to S3 at Collections/Brands/&#123;brand-name&#125;/logo.
          </Text>
          <div className="flex items-center gap-2">
            <Badge color="green">{featuredCount} featured</Badge>
            <Badge>{collections.length} collections</Badge>
          </div>
        </div>

        <div className="max-w-md">
          <Label htmlFor="brand-search">Search collections</Label>
          <Input
            id="brand-search"
            placeholder="Search by title or handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <Text>Loading collections...</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Brand</Table.HeaderCell>
                <Table.HeaderCell>Featured</Table.HeaderCell>
                <Table.HeaderCell>Rank</Table.HeaderCell>
                <Table.HeaderCell>Scale</Table.HeaderCell>
                <Table.HeaderCell>Logo</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filtered.map((row) => {
                const busy = savingId === row.id || uploadingId === row.id
                return (
                  <Table.Row key={row.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <Text weight="plus">{row.title || "Untitled"}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {row.handle || row.id}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Switch
                        checked={row.featured_on_homepage}
                        disabled={busy}
                        onCheckedChange={async (checked) => {
                          try {
                            await patchCollection(row.id, { featured_on_homepage: checked })
                          } catch {
                            /* toast handled in patchCollection */
                          }
                        }}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={row.homepage_rank}
                        disabled={busy}
                        onBlur={async (e) => {
                          clearTimeout(rankSaveTimers.current[row.id])
                          const next = Number(e.target.value)
                          await saveHomepageRank(row.id, next)
                        }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return
                          e.preventDefault()
                          clearTimeout(rankSaveTimers.current[row.id])
                          const next = Number((e.target as HTMLInputElement).value)
                          await saveHomepageRank(row.id, next)
                          ;(e.target as HTMLInputElement).blur()
                        }}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          setCollections((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, homepage_rank: Number.isFinite(next) ? next : 0 }
                                : item
                            )
                          )
                          if (Number.isFinite(next)) {
                            scheduleHomepageRankSave(row.id, next)
                          }
                        }}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        type="number"
                        min={0.1}
                        step={0.1}
                        className="w-20"
                        value={row.brand_logo_scale}
                        disabled={busy}
                        onBlur={async (e) => {
                          clearTimeout(scaleSaveTimers.current[row.id])
                          const next = Number(e.target.value)
                          await saveBrandLogoScale(row.id, next)
                        }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return
                          e.preventDefault()
                          clearTimeout(scaleSaveTimers.current[row.id])
                          const next = Number((e.target as HTMLInputElement).value)
                          await saveBrandLogoScale(row.id, next)
                          ;(e.target as HTMLInputElement).blur()
                        }}
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          setCollections((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    brand_logo_scale: Number.isFinite(next) ? next : 1,
                                  }
                                : item
                            )
                          )
                          if (Number.isFinite(next)) {
                            scheduleBrandLogoScaleSave(row.id, next)
                          }
                        }}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      {row.brand_logo_url ? (
                        <BrandLogoPreview
                          src={row.brand_logo_url}
                          alt={row.title}
                          scale={row.brand_logo_scale}
                        />
                      ) : (
                        <Text size="small" className="text-ui-fg-subtle">
                          No logo
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => {
                            fileInputs.current[row.id] = el
                          }}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleUpload(row, file)
                            e.target.value = ""
                          }}
                        />
                        <Button
                          size="small"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => fileInputs.current[row.id]?.click()}
                        >
                          <Plus />
                          Upload
                        </Button>
                        {row.brand_logo_url ? (
                          <Button
                            size="small"
                            variant="danger"
                            disabled={busy}
                            onClick={() => void handleRemoveLogo(row)}
                          >
                            <Trash />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Featured Brand",
})

export default FeaturedBrandsPage
