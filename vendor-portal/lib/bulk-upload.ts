import { generateSku } from "./sku"
import { GST_TAX_CODES } from "./gst-tax-codes"

export type Category = { id: string; name: string; parent_category_id?: string | null }
export type Collection = { id: string; title: string }

export const brandReady = (state: { status: string; fileUrl?: string } | undefined): boolean =>
  Boolean(state?.fileUrl && ["authorized", "pending", "uploaded"].includes(state.status))
export type RawRow = Record<string, unknown>

export type ParsedRow = {
  rowNumber: number
  title: string
  subtitle: string
  handle: string
  description: string
  brand: string
  category: string
  additionalCategoryIds: string[]
  subcategory: string
  collection: string
  tags: string[]
  type: string
  discountable: boolean
  height: string
  width: string
  length: string
  weight: string
  midCode: string
  hsCode: string
  countryOfOrigin: string
  taxCode: string
  gstRate: number | null
  shippingProfile: string
  videoUrls: string[]
  extraOptions: Record<string, string>
  variantTitle: string
  sku: string
  managedInventory: boolean
  allowBackorder: boolean
  inventoryCount: string
  price: string
  discountedPrice: string
  discountPercent: number | null
  thumbnailRef: string
  imageRefs: string[]
  brandLetterRef: string
  // User can override the parsed category by picking from the existing
  // category list, or request a brand-new one via a free-text remark that
  // gets surfaced to admins on the resulting product. Both can coexist —
  // selectedCategoryId wins for the actual category assignment, the remark
  // is stored in product.metadata.category_request for admin review.
  selectedCategoryId?: string
  resolvedParentCategoryId?: string
  categoryRequest?: string
  // Same dual-track pattern for collection: pick one of the existing
  // collections from the dropdown, or leave a remark requesting a new one.
  selectedCollectionId?: string
  collectionRequest?: string
  option1Name: string
  option1Value: string
  option2Name: string
  option2Value: string
  visualOptionName: string
  visualOptionValue: string
  visualImageRefs: string[]
  errors: string[]
  warnings: string[]
  status: "pending" | "uploading" | "success" | "failed"
  errorMessage?: string
}

export const TEMPLATE_HEADERS: Array<{ key: string; example: string; required?: boolean }> = [
  { key: "Title", example: "Winter jacket", required: true },
  { key: "Subtitle", example: "Warm and cozy" },
  { key: "Handle", example: "winter-jacket" },
  { key: "Description", example: "A warm and cozy jacket" },
  { key: "Brand", example: "Nike", required: true },
  { key: "Category", example: "Clothing" },
  { key: "Subcategory", example: "Jackets" },
  { key: "Additional Category IDs", example: "" },
  { key: "Collection", example: "Winter Collection" },
  { key: "Tags", example: "winter, jacket, outdoor" },
  { key: "Type", example: "" },
  { key: "Discountable", example: "Yes" },
  { key: "Height", example: "" },
  { key: "Width", example: "" },
  { key: "Length", example: "" },
  { key: "Weight", example: "" },
  { key: "MID Code", example: "" },
  { key: "HS Code", example: "" },
  { key: "Country of Origin", example: "IN" },
  { key: "Tax Code", example: "GST_5", required: true },
  { key: "GST Rate", example: "" },
  { key: "Shipping Profile ID", example: "" },
  { key: "Video URLs", example: "" },
  { key: "Option 1 Name", example: "Size" },
  { key: "Option 1 Value", example: "M" },
  { key: "Option 2 Name", example: "" },
  { key: "Option 2 Value", example: "" },
  { key: "Option 3 Name", example: "" },
  { key: "Option 3 Value", example: "" },
  { key: "Visual Option Name", example: "" },
  { key: "Visual Option Value", example: "" },
  { key: "Visual Image Refs", example: "" },
  { key: "Variant Title", example: "Default variant" },
  { key: "SKU", example: "(auto)" },
  { key: "Managed Inventory", example: "Yes" },
  { key: "Allow Backorder", example: "No" },
  { key: "Inventory Count", example: "10" },
  { key: "Price INR", example: "1999", required: true },
  { key: "Discounted Price INR", example: "1499" },
  { key: "Discount %", example: "(auto)" },
  // Image columns — one image per cell.
  // You can either:
  //   (a) Use Excel's Insert → Picture in Cell (Excel 2021 / M365) — the
  //       portal extracts the binary directly from the .xlsx and uploads it.
  //   (b) Type a filename and drop the matching file in the portal's image
  //       dropzone — filenames are matched case-insensitively.
  // The Image 1..Image 5 columns each hold ONE image; add more by editing
  // TEMPLATE_HEADERS and IMAGE_COLUMN_PATTERN.
  { key: "Thumbnail", example: "winter-jacket-1.jpg" },
  { key: "Image 1", example: "winter-jacket-2.jpg" },
  { key: "Image 2", example: "winter-jacket-3.jpg" },
  { key: "Image 3", example: "" },
  { key: "Image 4", example: "" },
  { key: "Image 5", example: "" },
  { key: "Brand Letter", example: "nike-letter.pdf" },
]

// Matches "Image 1", "Image 2", ..., "Image10", "image_1", etc. Used by both
// the row parser (legacy filename-based flow) and the embedded-image cell
// resolver. Keeping this in one place means adding/removing image columns is
// a one-line edit above. We also accept the legacy "Images" (plural) column
// as a synonym for backwards compatibility with templates the user already
// downloaded — that one holds comma-separated filenames.
export const IMAGE_COLUMN_PATTERN = /^image\s*\d*$/i
export const LEGACY_IMAGES_COLUMN = "Images"

export const normalizeImageKey = (name: string): string =>
  isMediaUrl(name.trim()) ? name.trim() : name.trim().toLowerCase()

const truthy = (v: unknown): boolean => {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v === 1
  const s = String(v ?? "").trim().toLowerCase()
  return ["yes", "y", "true", "1", "on"].includes(s)
}

const falsy = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase()
  return ["no", "n", "false", "0", "off"].includes(s)
}

const toStr = (v: unknown): string => {
  if (v === undefined || v === null) return ""
  return String(v).trim()
}

// Never strip arbitrary characters: malformed amounts must not silently become a different price.
export const numericCell = (value: unknown): string => toStr(value)

const toNumStr = numericCell

export const computeDiscountPercent = (
  price: string,
  discountedPrice: string
): number | null => {
  const p = parseFloat(price)
  const d = parseFloat(discountedPrice)
  if (!Number.isFinite(p) || !Number.isFinite(d)) return null
  if (p <= 0 || d < 0) return null
  if (d >= p) return 0
  return Math.round(((p - d) / p) * 1000) / 10
}

export const productGroupKey = (row: Pick<ParsedRow, "title" | "handle" | "rowNumber">): string => {
  const title = row.title.trim().toLowerCase()
  const handle = row.handle.trim().toLowerCase()
  if (handle) return `handle:${handle}`
  if (title) return `title:${title}`
  return `row:${row.rowNumber}`
}

export const rowOptionValues = (row: Pick<ParsedRow, "option1Name" | "option1Value" | "option2Name" | "option2Value" | "extraOptions">): Record<string, string> => {
  const map: Record<string, string> = Object.create(null)
  if (row.option1Name.trim() && row.option1Value.trim()) {
    map[row.option1Name.trim()] = row.option1Value.trim()
  }
  if (row.option2Name.trim() && row.option2Value.trim()) {
    map[row.option2Name.trim()] = row.option2Value.trim()
  }
  return Object.assign(map, row.extraOptions)
}

export const buildOptionsFromGroup = (groupRows: ParsedRow[]): Array<{ title: string; values: string[] }> => {
  const optionValuesMap = new Map<string, Set<string>>()
  groupRows.forEach((row) => {
    Object.entries(rowOptionValues(row)).forEach(([name, value]) => {
      if (!optionValuesMap.has(name)) optionValuesMap.set(name, new Set())
      optionValuesMap.get(name)!.add(value)
    })
  })
  return Array.from(optionValuesMap.entries()).map(([title, values]) => ({
    title,
    values: Array.from(values),
  }))
}

const GROUP_ERROR = "Product group: "
export const applyGroupValidation = (rows: ParsedRow[]): ParsedRow[] => {
  const clean = rows.map(row => ({ ...row, errors: row.errors.filter(e => !e.startsWith(GROUP_ERROR)) }))
  const groups = new Map<string, ParsedRow[]>()
  for (const row of clean) {
    const key = productGroupKey(row)
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const productFields: Array<keyof ParsedRow> = ["title", "brand", "subtitle", "description", "handle", "category", "subcategory", "additionalCategoryIds", "collection", "type", "tags", "discountable", "height", "width", "length", "weight", "midCode", "hsCode", "countryOfOrigin", "taxCode", "gstRate", "shippingProfile", "videoUrls", "selectedCategoryId", "selectedCollectionId", "categoryRequest", "collectionRequest", "visualOptionName"]
  for (const group of groups.values()) {
    const messages: string[] = []
    if (group.length > 100) messages.push("At most 100 variants are allowed per product")
    if (group.length > 1) {
      const first = group[0]
      const names = Object.keys(rowOptionValues(first)).sort()
      const seen = new Set<string>()
      for (const row of group) {
        const options = rowOptionValues(row)
        if (!names.length || JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(names)) messages.push("Every variant needs the same option names and a value for each")
        const combo = JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)))
        if (seen.has(combo)) messages.push("Duplicate variant option combination")
        seen.add(combo)
        const changed = productFields.filter(field => JSON.stringify(row[field]) !== JSON.stringify(first[field]))
        if (changed.length) messages.push(`Product details must match on every variant row (${changed.join(", ")})`)
      }
    }
    if (group.some(row => row.errors.length)) messages.push("Fix every row in this product before submitting; partial variant imports are blocked")
    for (const row of group) row.errors.push(...new Set(messages.map(m => GROUP_ERROR + m)))
  }
  return clean.map(row => ({ ...row, status: row.errors.length ? "failed" : row.status === "failed" && row.errorMessage?.startsWith(GROUP_ERROR) ? "pending" : row.status, errorMessage: row.errors[0] }))
}

export const parseRows = (raw: RawRow[], categories: Category[], collections: Collection[]): ParsedRow[] => {
  const categoryByName = new Map(categories.map(c => [c.name.toLowerCase().trim(), c.id]))
  const collectionByName = new Map(collections.map(c => [c.title.toLowerCase().trim(), c.id]))
  const usedSkus = new Set<string>()
  const parsed = raw.map((r, idx): ParsedRow => {
    const rowNumber = typeof r.__rowNumber === "number" ? r.__rowNumber : idx + 2 // +1 for header, +1 for 1-based
    const errors: string[] = []
    const warnings: string[] = []

    const get = (k: string): unknown => {
      const direct = r[k]
      if (direct !== undefined) return direct
      const wantedKey = k.toLowerCase().replace(/\s+|\*/g, "")
      for (const key of Object.keys(r)) {
        const norm = key.toLowerCase().replace(/\s+|\*/g, "")
        if (norm === wantedKey) return r[key]
      }
      return undefined
    }

    const title = toStr(get("Title"))
    const brand = toStr(get("Brand"))
    const price = toNumStr(get("Price INR"))
    const discountedPrice = toNumStr(get("Discounted Price INR"))

    if (!title) errors.push("Title is required")
    if (!brand) errors.push("Brand is required (used to generate SKU)")
    if (!price) errors.push("Price INR is required")

    const numPrice = parseFloat(price)
    const numDiscount = parseFloat(discountedPrice)
    if (price && (!Number.isFinite(numPrice) || numPrice <= 0)) {
      errors.push("Price INR must be greater than zero")
    }
    if (discountedPrice && (!Number.isFinite(numDiscount) || numDiscount < 0)) {
      errors.push("Discounted Price INR must be a positive number")
    }
    if (
      Number.isFinite(numPrice) &&
      Number.isFinite(numDiscount) &&
      numDiscount > numPrice
    ) {
      errors.push("Discounted Price INR cannot exceed Price INR (MRP)")
    }

    for (const field of ["Price INR", "Discounted Price INR", "Height", "Width", "Length", "Weight", "Inventory Count"]) {
      const value = toStr(get(field))
      if (!value) continue
      if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > Number.MAX_SAFE_INTEGER) errors.push(`${field} must be a non-negative number without currency symbols or separators`)
      if (field === "Inventory Count" && !Number.isSafeInteger(Number(value))) errors.push("Inventory Count must be a whole number")
      if (["Price INR", "Discounted Price INR"].includes(field) && /^\d+\.\d{3,}$/.test(value)) errors.push(`${field} supports at most two decimal places`)
    }
    for (const field of ["Discountable", "Managed Inventory", "Allow Backorder"]) {
      const value = get(field)
      if (toStr(value) && !truthy(value) && !falsy(value)) errors.push(`${field} must be Yes/No, True/False or 1/0`)
    }
    const taxCode = toStr(get("Tax Code")).toUpperCase()
    const tax = GST_TAX_CODES.find(item => item.code === taxCode)
    if (!tax) errors.push("Tax Code is required; use a code from the GST Codes sheet")
    const suppliedRate = toStr(get("GST Rate"))
    if (suppliedRate && (!/^\d+(?:\.\d+)?$/.test(suppliedRate) || Number(suppliedRate) !== tax?.rate)) errors.push("GST Rate must match the selected Tax Code; leave it blank to calculate automatically")
    const shippingProfile = toStr(get("Shipping Profile ID"))
    if (shippingProfile && !/^sp_[a-zA-Z0-9]+$/.test(shippingProfile)) errors.push("Shipping Profile ID must be a valid sp_ ID; leave blank for the default profile")
    const videoUrls = toStr(get("Video URLs")).split(",").map(v => v.trim()).filter(Boolean)
    if (videoUrls.some(url => !isMediaUrl(url))) errors.push("Video URLs must be comma-separated public HTTPS URLs")
    const optionPairs = new Map<number, { name: string; value: string }>()
    for (const key of Object.keys(r)) {
      const match = key.replace(/\*/g, "").trim().match(/^option\s*(\d+)\s*(name|value)$/i)
      if (!match) continue
      const number = Number(match[1])
      const pair = optionPairs.get(number) || { name: "", value: "" }
      pair[match[2].toLowerCase() as "name" | "value"] = toStr(r[key])
      optionPairs.set(number, pair)
    }
    const extraOptions: Record<string, string> = Object.create(null)
    const names = new Set<string>()
    for (const [number, pair] of optionPairs) {
      if (!!pair.name !== !!pair.value) errors.push(`Option ${number} needs both a name and value`)
      if (pair.name && names.has(pair.name.toLowerCase())) errors.push(`Duplicate option name: ${pair.name}`)
      if (pair.name) names.add(pair.name.toLowerCase())
      if (number > 2 && pair.name && pair.value) extraOptions[pair.name] = pair.value
    }
    const optionValues = Object.fromEntries([...optionPairs.values()].filter(p => p.name && p.value).map(p => [p.name, p.value]))
    const visualName = toStr(get("Visual Option Name"))
    const visualValue = toStr(get("Visual Option Value"))
    if ((visualName || visualValue || toStr(get("Visual Image Refs"))) && (!visualName || !visualValue || optionValues[visualName] !== visualValue)) errors.push("Visual option name and value must match an option on this variant")
    if (toStr(get("Handle")) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(toStr(get("Handle")))) errors.push("Handle must use lowercase letters, numbers and single hyphens")
    if (toStr(get("Country of Origin")) && !/^[A-Za-z]{2}$/.test(toStr(get("Country of Origin")))) errors.push("Country of Origin must be a two-letter code, e.g. IN")

    const categoryName = toStr(get("Category"))
    const additionalCategoryIds = [...new Set(toStr(get("Additional Category IDs")).split(",").map(id => id.trim()).filter(Boolean))]
    if (additionalCategoryIds.some(id => !categories.some(category => category.id === id))) errors.push("Additional Category IDs must match IDs in the Categories sheet")
    const subcategoryName = toStr(get("Subcategory"))
    const collectionName = toStr(get("Collection"))

    // Resolve parent category (Category column)
    const matchedParentId = categoryName
      ? categoryByName.get(categoryName.toLowerCase())
      : undefined
    if (categoryName && !matchedParentId) {
      warnings.push(`Category "${categoryName}" not found — request auto-submitted for admin review`)
    }

    // Resolve subcategory, then determine the final category ID to assign
    let finalCategoryId: string | undefined = matchedParentId
    let resolvedParentCategoryId: string | undefined = matchedParentId
    // Tracks what to pre-fill in the "Request new category" remark
    let autoCategoryRequest = ""

    if (!matchedParentId && categoryName) {
      // The whole parent category is new — request it
      autoCategoryRequest = categoryName
    }

    if (subcategoryName) {
      if (matchedParentId) {
        // Look for a subcategory whose parent is the matched parent
        const subcat = categories.find(
          (c) =>
            (c.name || "").toLowerCase().trim() === subcategoryName.toLowerCase().trim() &&
            c.parent_category_id === matchedParentId
        )
        if (subcat) {
          finalCategoryId = subcat.id
        } else {
          warnings.push(
            `Subcategory "${subcategoryName}" not found under "${categoryName}" — request auto-submitted for admin review`
          )
          // Request the subcategory under the known parent
          autoCategoryRequest = `${subcategoryName} (under ${categoryName})`
        }
      } else {
        // No parent given — try to find subcategory anywhere in the tree
        const subcat = categories.find(
          (c) =>
            (c.name || "").toLowerCase().trim() === subcategoryName.toLowerCase().trim() &&
            !!c.parent_category_id
        )
        if (subcat) {
          finalCategoryId = subcat.id
          resolvedParentCategoryId = subcat.parent_category_id || undefined
        } else {
          warnings.push(`Subcategory "${subcategoryName}" not found — request auto-submitted for admin review`)
          autoCategoryRequest = autoCategoryRequest
            ? `${autoCategoryRequest} > ${subcategoryName}`
            : subcategoryName
        }
      }
    }

    const matchedCollectionId = collectionName
      ? collectionByName.get(collectionName.toLowerCase())
      : undefined
    const autoCollectionRequest = collectionName && !matchedCollectionId ? collectionName : ""
    if (collectionName && !matchedCollectionId) {
      warnings.push(`Collection "${collectionName}" not found — request auto-submitted for admin review`)
    }

    let sku = toStr(get("SKU"))
    if (!sku || sku.toLowerCase() === "(auto)") {
      sku = brand && title ? generateSku(brand, title, usedSkus) : ""
    } else {
      if (usedSkus.has(sku.toUpperCase())) errors.push("Duplicate SKU within this file (case-insensitive)")
      usedSkus.add(sku.toUpperCase())
    }

    const discountableRaw = get("Discountable")
    const discountable = discountableRaw === undefined || discountableRaw === ""
      ? true
      : !falsy(discountableRaw)

    const managedInventoryRaw = get("Managed Inventory")
    const managedInventory =
      managedInventoryRaw === undefined || managedInventoryRaw === ""
        ? true
        : !falsy(managedInventoryRaw)

    const allowBackorder = truthy(get("Allow Backorder"))

    const tagsRaw = toStr(get("Tags"))
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : []

    const thumbnailRef = toStr(get("Thumbnail"))

    // Collect image filenames from:
    //   - Image 1, Image 2, ... Image N columns (one filename each)
    //   - Legacy "Images" column (comma-separated, kept for older templates)
    // Both produce strings of filenames the user is expected to upload via
    // the dropzone unless they used embedded images (handled separately).
    const imageRefs: string[] = []
    for (const headerKey of Object.keys(r)) {
      if (!IMAGE_COLUMN_PATTERN.test(headerKey.replace(/\*/g, "").trim())) continue
      const v = toStr(get(headerKey))
      if (v) imageRefs.push(v)
    }
    const legacyImagesRaw = toStr(get(LEGACY_IMAGES_COLUMN))
    if (legacyImagesRaw) {
      for (const piece of legacyImagesRaw.split(",")) {
        const t = piece.trim()
        if (t) imageRefs.push(t)
      }
    }
    const brandLetterRef = toStr(get("Brand Letter"))

    return {
      rowNumber,
      title,
      subtitle: toStr(get("Subtitle")),
      handle: toStr(get("Handle")),
      description: toStr(get("Description")),
      brand,
      category: categoryName,
      additionalCategoryIds,
      subcategory: subcategoryName,
      collection: collectionName,
      tags,
      type: toStr(get("Type")),
      discountable,
      height: toNumStr(get("Height")),
      width: toNumStr(get("Width")),
      length: toNumStr(get("Length")),
      weight: toNumStr(get("Weight")),
      midCode: toStr(get("MID Code")),
      hsCode: toStr(get("HS Code")),
      countryOfOrigin: toStr(get("Country of Origin")).toUpperCase(),
      taxCode, gstRate: tax?.rate ?? null, shippingProfile, videoUrls, extraOptions,
      option1Name: toStr(get("Option 1 Name")),
      option1Value: toStr(get("Option 1 Value")),
      option2Name: toStr(get("Option 2 Name")),
      option2Value: toStr(get("Option 2 Value")),
      visualOptionName: toStr(get("Visual Option Name")),
      visualOptionValue: toStr(get("Visual Option Value")),
      visualImageRefs: toStr(get("Visual Image Refs"))
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean),
      variantTitle: toStr(get("Variant Title")) || Object.values(optionValues).join(" / ") || "Default variant",
      sku,
      managedInventory,
      allowBackorder,
      inventoryCount: toNumStr(get("Inventory Count")),
      price,
      discountedPrice,
      discountPercent: computeDiscountPercent(price, discountedPrice),
      thumbnailRef,
      imageRefs,
      brandLetterRef,
      selectedCategoryId: finalCategoryId,
      resolvedParentCategoryId,
      categoryRequest: autoCategoryRequest,
      selectedCollectionId: matchedCollectionId,
      collectionRequest: autoCollectionRequest,
      errors,
      warnings,
      status: errors.length > 0 ? "failed" : "pending",
      errorMessage: errors[0],
    }
  })
  const duplicates = new Map<string, number>()
  for (const row of parsed) if (row.sku) duplicates.set(row.sku.toUpperCase(), (duplicates.get(row.sku.toUpperCase()) || 0) + 1)
  return applyGroupValidation(parsed.map(row => duplicates.get(row.sku.toUpperCase())! > 1 ? { ...row, errors: [...row.errors, "Duplicate SKU within this file (case-insensitive)"] } : row))
}


export function isMediaUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password } catch { return false }
}
