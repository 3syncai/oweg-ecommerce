export type FeaturedBrandMetadata = {
  featured_on_homepage?: boolean | string
  homepage_rank?: number | string
  brand_logo_url?: string
  brand_logo_s3_key?: string
  brand_logo_scale?: number | string
  [key: string]: unknown
}

export type FeaturedBrandCollection = {
  id: string
  title?: string | null
  handle?: string | null
  metadata?: FeaturedBrandMetadata | null
}

export function isFeaturedOnHomepage(metadata?: FeaturedBrandMetadata | null): boolean {
  const value = metadata?.featured_on_homepage
  if (value === true || value === "true") return true
  if (typeof value === "string" && value === "1") return true
  return false
}

export function getHomepageRank(metadata?: FeaturedBrandMetadata | null): number {
  const raw = metadata?.homepage_rank
  const parsed = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : 9999
}

export function getBrandLogoScale(metadata?: FeaturedBrandMetadata | null): number | undefined {
  const raw = metadata?.brand_logo_scale
  const parsed = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function serializeFeaturedBrand(collection: FeaturedBrandCollection) {
  const metadata = (collection.metadata || {}) as FeaturedBrandMetadata
  return {
    id: collection.id,
    title: collection.title || "",
    handle: collection.handle || "",
    featured_on_homepage: isFeaturedOnHomepage(metadata),
    homepage_rank: getHomepageRank(metadata),
    brand_logo_url: typeof metadata.brand_logo_url === "string" ? metadata.brand_logo_url : "",
    brand_logo_s3_key: typeof metadata.brand_logo_s3_key === "string" ? metadata.brand_logo_s3_key : "",
    brand_logo_scale: getBrandLogoScale(metadata) ?? 1,
    metadata,
  }
}

export function sortFeaturedBrands<T extends { metadata?: FeaturedBrandMetadata | null; title?: string | null }>(
  collections: T[]
): T[] {
  return [...collections].sort((a, b) => {
    const rankA = getHomepageRank(a.metadata)
    const rankB = getHomepageRank(b.metadata)
    if (rankA !== rankB) return rankA - rankB
    return (a.title || "").localeCompare(b.title || "")
  })
}

export function mergeCollectionMetadata(
  existing: FeaturedBrandMetadata | null | undefined,
  patch: Partial<FeaturedBrandMetadata>
): FeaturedBrandMetadata {
  return {
    ...(existing || {}),
    ...patch,
  }
}

export function logoMetadataClearPatch(): Partial<FeaturedBrandMetadata> {
  return {
    brand_logo_url: "",
    brand_logo_s3_key: "",
  }
}
