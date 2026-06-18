export type MegaMenuRedirectTarget = "parent" | "subcategory"

export type MegaMenuBanner = {
  id: string
  image_url: string
  s3_key: string
  link_url: string
  priority: number
  enabled: boolean
  alt_text?: string
  open_in_new_tab?: boolean
  redirect_target?: MegaMenuRedirectTarget
  subcategory_handle?: string
  subcategory_name?: string
  updated_at?: string
}

export type SubcategoryOption = {
  id: string
  name: string
  handle: string
}

export type CategoryMegaMenuBannerMetadata = {
  mega_menu_banners?: MegaMenuBanner[]
  [key: string]: unknown
}

export type CategoryWithBanners = {
  id: string
  name?: string | null
  handle?: string | null
  parent_category_id?: string | null
  metadata?: CategoryMegaMenuBannerMetadata | null
}

export function sanitizeCategoryFolderName(value?: string | null): string {
  return (value || "category")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function normalizeCategoryHandle(value?: string | null): string {
  return sanitizeCategoryFolderName(value)
}

export function getBannersFromMetadata(
  metadata?: CategoryMegaMenuBannerMetadata | null
): MegaMenuBanner[] {
  const raw = metadata?.mega_menu_banners
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is MegaMenuBanner => {
    return (
      !!item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.image_url === "string" &&
      typeof item.s3_key === "string" &&
      typeof item.link_url === "string"
    )
  })
}

export function getBannerPriority(banner: MegaMenuBanner): number {
  const parsed = typeof banner.priority === "number" ? banner.priority : Number(banner.priority)
  return Number.isFinite(parsed) ? parsed : 9999
}

export function sortBannersByPriority(banners: MegaMenuBanner[]): MegaMenuBanner[] {
  return [...banners].sort((a, b) => {
    const rankA = getBannerPriority(a)
    const rankB = getBannerPriority(b)
    if (rankA !== rankB) return rankA - rankB
    return (a.updated_at || "").localeCompare(b.updated_at || "")
  })
}

export function isBannerEnabled(banner: MegaMenuBanner): boolean {
  if (banner.enabled === false) return false
  if (typeof banner.enabled === "string" && banner.enabled === "false") return false
  return true
}

export function getActiveStorefrontBanners(
  metadata?: CategoryMegaMenuBannerMetadata | null
): MegaMenuBanner[] {
  return sortBannersByPriority(getBannersFromMetadata(metadata)).filter(
    (banner) =>
      isBannerEnabled(banner) &&
      banner.image_url.trim() !== "" &&
      banner.link_url.trim() !== ""
  )
}

export function buildMegaMenuBannerLinkUrl(
  parentHandle: string,
  redirectTarget: MegaMenuRedirectTarget,
  subcategoryHandle?: string
): string {
  const parent = encodeURIComponent(parentHandle)
  if (redirectTarget === "subcategory" && subcategoryHandle?.trim()) {
    return `/c/${parent}/${encodeURIComponent(subcategoryHandle.trim())}`
  }
  return `/c/${parent}`
}

export function parseRedirectTarget(value: unknown): MegaMenuRedirectTarget | null {
  if (value === "parent" || value === "subcategory") return value
  return null
}

export function getBannerRedirectLabel(
  banner: MegaMenuBanner,
  parentCategoryName?: string
): string {
  if (banner.redirect_target === "subcategory" && banner.subcategory_name) {
    return banner.subcategory_name
  }
  if (banner.redirect_target === "parent") {
    return parentCategoryName ? `All ${parentCategoryName}` : "Parent category"
  }
  if (banner.subcategory_name) return banner.subcategory_name
  return banner.link_url || "Custom link"
}

export function resolveRedirectSelection(input: {
  parentHandle: string
  parentName: string
  redirectTarget: MegaMenuRedirectTarget
  subcategoryHandle?: string
  subcategories: SubcategoryOption[]
}): {
  link_url: string
  redirect_target: MegaMenuRedirectTarget
  subcategory_handle: string
  subcategory_name: string
} {
  const parentHandle = input.parentHandle.trim()
  if (!parentHandle) {
    throw new Error("Parent category handle is required")
  }

  if (input.redirectTarget === "parent") {
    return {
      link_url: buildMegaMenuBannerLinkUrl(parentHandle, "parent"),
      redirect_target: "parent",
      subcategory_handle: "",
      subcategory_name: "",
    }
  }

  const subHandle = (input.subcategoryHandle || "").trim()
  if (!subHandle) {
    throw new Error("subcategory_handle is required when redirect_target is subcategory")
  }

  const matched = input.subcategories.find(
    (sub) => sub.handle === subHandle || normalizeCategoryHandle(sub.handle) === normalizeCategoryHandle(subHandle)
  )
  if (!matched) {
    throw new Error("Selected subcategory does not belong to this category")
  }

  return {
    link_url: buildMegaMenuBannerLinkUrl(parentHandle, "subcategory", matched.handle),
    redirect_target: "subcategory",
    subcategory_handle: matched.handle,
    subcategory_name: matched.name,
  }
}

export function serializeMegaMenuBanner(banner: MegaMenuBanner, parentCategoryName?: string) {
  return {
    id: banner.id,
    image_url: banner.image_url,
    s3_key: banner.s3_key,
    link_url: banner.link_url,
    priority: getBannerPriority(banner),
    enabled: isBannerEnabled(banner),
    alt_text: typeof banner.alt_text === "string" ? banner.alt_text : "",
    open_in_new_tab: banner.open_in_new_tab === true,
    redirect_target: banner.redirect_target || "parent",
    subcategory_handle: banner.subcategory_handle || "",
    subcategory_name: banner.subcategory_name || "",
    redirect_label: getBannerRedirectLabel(banner, parentCategoryName),
    updated_at: banner.updated_at || "",
  }
}

export function serializeCategoryWithBanners(category: CategoryWithBanners) {
  const parentName = category.name || ""
  const banners = sortBannersByPriority(getBannersFromMetadata(category.metadata)).map((banner) =>
    serializeMegaMenuBanner(banner, parentName)
  )
  return {
    id: category.id,
    name: category.name || "",
    handle: category.handle || "",
    banners,
    banner_count: banners.length,
    enabled_banner_count: banners.filter((b) => b.enabled).length,
  }
}

export function mergeCategoryMetadata(
  existing: CategoryMegaMenuBannerMetadata | null | undefined,
  patch: Partial<CategoryMegaMenuBannerMetadata>
): CategoryMegaMenuBannerMetadata {
  return {
    ...(existing || {}),
    ...patch,
  }
}

export function parseBooleanField(value: unknown, defaultValue = true): boolean {
  if (typeof value === "boolean") return value
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return defaultValue
}

export function parseNumericField(value: unknown, defaultValue = 9999): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return defaultValue
}

export function parseLinkUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim()
}

export function createBannerRecord(input: {
  id?: string
  image_url: string
  s3_key: string
  link_url: string
  priority?: number
  enabled?: boolean
  alt_text?: string
  open_in_new_tab?: boolean
  redirect_target?: MegaMenuRedirectTarget
  subcategory_handle?: string
  subcategory_name?: string
}): MegaMenuBanner {
  return {
    id: input.id || crypto.randomUUID(),
    image_url: input.image_url,
    s3_key: input.s3_key,
    link_url: input.link_url,
    priority: input.priority ?? 9999,
    enabled: input.enabled ?? true,
    alt_text: input.alt_text || "",
    open_in_new_tab: input.open_in_new_tab ?? false,
    redirect_target: input.redirect_target,
    subcategory_handle: input.subcategory_handle || "",
    subcategory_name: input.subcategory_name || "",
    updated_at: new Date().toISOString(),
  }
}

export function upsertBannerInMetadata(
  metadata: CategoryMegaMenuBannerMetadata | null | undefined,
  banner: MegaMenuBanner
): CategoryMegaMenuBannerMetadata {
  const banners = getBannersFromMetadata(metadata)
  const index = banners.findIndex((item) => item.id === banner.id)
  if (index >= 0) {
    banners[index] = banner
  } else {
    banners.push(banner)
  }
  return mergeCategoryMetadata(metadata, {
    mega_menu_banners: sortBannersByPriority(banners),
  })
}

export function removeBannerFromMetadata(
  metadata: CategoryMegaMenuBannerMetadata | null | undefined,
  bannerId: string
): { metadata: CategoryMegaMenuBannerMetadata; removed?: MegaMenuBanner } {
  const banners = getBannersFromMetadata(metadata)
  const removed = banners.find((item) => item.id === bannerId)
  const next = banners.filter((item) => item.id !== bannerId)
  return {
    metadata: mergeCategoryMetadata(metadata, { mega_menu_banners: next }),
    removed,
  }
}

export function findBannerInMetadata(
  metadata: CategoryMegaMenuBannerMetadata | null | undefined,
  bannerId: string
): MegaMenuBanner | undefined {
  return getBannersFromMetadata(metadata).find((item) => item.id === bannerId)
}
