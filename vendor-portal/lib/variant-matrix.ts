export const MAX_AUTO_VARIANTS = 100

export type ProductOptionDef = {
  title: string
  values: string[]
  valuesInput?: string
}

export type VariantMatrixRow = {
  id?: string
  title: string
  sku: string
  managedInventory: boolean
  allowBackorder: boolean
  inventoryCount: string
  price: string
  discountedPrice: string
  optionValues: Record<string, string>
}

export type UploadedImageRef = {
  url: string
  key?: string
  filename?: string
  originalName?: string
}

const VISUAL_OPTION_PATTERN = /color|colour|pattern|finish|shade|style/i

export function parseOptionValuesInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  )
}

export function normalizeProductOptions(options: ProductOptionDef[]): ProductOptionDef[] {
  const byTitle = new Map<string, ProductOptionDef>()

  for (const opt of options) {
    const title = opt.title.trim()
    if (!title) continue

    const fromInput = opt.valuesInput ? parseOptionValuesInput(opt.valuesInput) : []
    const fromValues = (opt.values || []).map((v) => v.trim()).filter(Boolean)
    const values = [...fromValues, ...fromInput]
    if (!values.length && !byTitle.has(title.toLowerCase())) {
      // Keep empty titles only if we need a placeholder row in the editor —
      // skip empty-value options in the normalized list used for create/matrix.
      continue
    }

    const key = title.toLowerCase()
    const existing = byTitle.get(key)
    if (existing) {
      const merged = Array.from(new Set([...existing.values, ...values]))
      byTitle.set(key, {
        title: existing.title,
        values: merged,
        valuesInput: merged.join(", "),
      })
    } else if (values.length) {
      const unique = Array.from(new Set(values))
      byTitle.set(key, {
        title,
        values: unique,
        valuesInput: unique.join(", "),
      })
    }
  }

  return Array.from(byTitle.values())
}

export function detectVisualOption(optionTitles: string[]): string | undefined {
  if (!optionTitles.length) return undefined
  const match = optionTitles.find((title) => VISUAL_OPTION_PATTERN.test(title))
  return match || optionTitles[0]
}

export function variantComboKey(
  optionTitles: string[],
  optionValues: Record<string, string>
): string {
  return optionTitles.map((title) => optionValues[title]?.trim() || "").join("|")
}

export function cartesianProduct(
  options: ProductOptionDef[]
): Record<string, string>[] {
  const normalized = normalizeProductOptions(options)
  if (!normalized.length) return []

  let combos: Record<string, string>[] = [{}]
  for (const opt of normalized) {
    const next: Record<string, string>[] = []
    for (const combo of combos) {
      for (const value of opt.values) {
        next.push({ ...combo, [opt.title]: value })
      }
    }
    combos = next
    if (combos.length > MAX_AUTO_VARIANTS) break
  }
  return combos
}

export function buildVariantRows(
  options: ProductOptionDef[],
  existingRows: VariantMatrixRow[] = []
): VariantMatrixRow[] {
  const normalized = normalizeProductOptions(options)
  if (!normalized.length) return existingRows

  const optionTitles = normalized.map((o) => o.title)
  const combos = cartesianProduct(normalized)
  if (combos.length > MAX_AUTO_VARIANTS) {
    throw new Error(`Too many variants (${combos.length}). Maximum is ${MAX_AUTO_VARIANTS}.`)
  }

  const existingByKey = new Map<string, VariantMatrixRow>()
  for (const row of existingRows) {
    existingByKey.set(variantComboKey(optionTitles, row.optionValues), row)
  }

  return combos.map((optionValues) => {
    const key = variantComboKey(optionTitles, optionValues)
    const existing = existingByKey.get(key)
    const title = Object.values(optionValues).join(" / ")
    if (existing) {
      return { ...existing, title, optionValues }
    }
    return {
      title,
      sku: "",
      managedInventory: true,
      allowBackorder: true,
      inventoryCount: "",
      price: "",
      discountedPrice: "",
      optionValues,
    }
  })
}

export function resolveProductOptionsFromRows(
  options: ProductOptionDef[],
  rows: VariantMatrixRow[]
): Array<{ title: string; values: string[] }> {
  return normalizeProductOptions(options).map((opt) => {
    const fromRows = rows
      .map((row) => row.optionValues[opt.title]?.trim())
      .filter((v): v is string => Boolean(v))
    return {
      title: opt.title,
      values: Array.from(new Set([...opt.values, ...fromRows])),
    }
  })
}

export function serializeColorImages(
  colorImages: Record<string, UploadedImageRef[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [key, images] of Object.entries(colorImages)) {
    const urls = images.map((img) => img.url).filter(Boolean)
    if (urls.length) result[key] = urls
  }
  return result
}

export function collectAllImageUrls(
  uploadedImages: UploadedImageRef[],
  colorImages: Record<string, UploadedImageRef[]>
): string[] {
  const urls = new Set<string>()
  uploadedImages.forEach((img) => {
    if (img.url) urls.add(img.url)
  })
  Object.values(colorImages).forEach((images) => {
    images.forEach((img) => {
      if (img.url) urls.add(img.url)
    })
  })
  return Array.from(urls)
}

export function computeDiscountPercent(price: string, discountedPrice: string): number | null {
  const basePrice = parseFloat(price)
  const salePrice = parseFloat(discountedPrice)
  if (!Number.isFinite(basePrice) || !Number.isFinite(salePrice)) return null
  if (basePrice <= 0 || salePrice <= 0) return null
  if (salePrice >= basePrice) return null
  return Math.round(((basePrice - salePrice) / basePrice) * 1000) / 10
}

/** True when Medusa's implied Default option is the only structure (not a real Color/Size matrix). */
export function isSimpleDefaultProduct(
  options: Array<{ title: string; values?: string[] }>,
  variants: Array<{ optionValues?: Record<string, string> }>
): boolean {
  if (variants.length > 1) return false
  if (options.length === 0) return true
  if (options.length > 1) return false

  const title = (options[0]?.title || "").trim().toLowerCase()
  if (title && title !== "default" && title !== "title") return false

  const values = options[0]?.values || []
  if (values.some((v) => (v || "").trim().toLowerCase() !== "default")) return false

  const optionValues = variants[0]?.optionValues || {}
  const entries = Object.entries(optionValues)
  if (!entries.length) return true

  return entries.every(
    ([key, value]) =>
      key.trim().toLowerCase() === "default" &&
      (!(value || "").trim() || value.trim().toLowerCase() === "default")
  )
}

export function createDefaultVariantRow(): VariantMatrixRow {
  return {
    title: "Default variant",
    sku: "",
    managedInventory: true,
    allowBackorder: true,
    inventoryCount: "",
    price: "",
    discountedPrice: "",
    optionValues: {},
  }
}

export function createVariantRowFromOptions(
  optionValues: Record<string, string>
): VariantMatrixRow {
  const title = Object.values(optionValues).filter(Boolean).join(" / ") || "Variant"
  return {
    title,
    sku: "",
    managedInventory: true,
    allowBackorder: true,
    inventoryCount: "",
    price: "",
    discountedPrice: "",
    optionValues: { ...optionValues },
  }
}

export function getSecondaryOptionTitles(
  options: ProductOptionDef[],
  visualOption: string
): string[] {
  return normalizeProductOptions(options)
    .map((o) => o.title)
    .filter((title) => title !== visualOption)
}

export function upsertOptionValue(
  options: ProductOptionDef[],
  optionTitle: string,
  value: string
): ProductOptionDef[] {
  const trimmed = value.trim()
  if (!trimmed) return options

  const existing = options.find((o) => o.title.trim() === optionTitle)
  if (existing) {
    const values = Array.from(new Set([...(existing.values || []), trimmed]))
    return options.map((o) =>
      o.title.trim() === optionTitle
        ? { ...o, title: optionTitle, values, valuesInput: values.join(", ") }
        : o
    )
  }

  return [
    ...options,
    { title: optionTitle, values: [trimmed], valuesInput: trimmed },
  ]
}

export function removeOptionValue(
  options: ProductOptionDef[],
  optionTitle: string,
  value: string
): ProductOptionDef[] {
  const targetTitle = optionTitle.trim().toLowerCase()
  const targetValue = value.trim().toLowerCase()
  return options.map((o) => {
    if (o.title.trim().toLowerCase() !== targetTitle) return o
    const values = (o.values || []).filter((v) => v.trim().toLowerCase() !== targetValue)
    return { ...o, values, valuesInput: values.join(", ") }
  })
}

export function collectVisualOptionValues(
  visualOption: string,
  variants: VariantMatrixRow[],
  colorImages: Record<string, UploadedImageRef[]>,
  productOptions: ProductOptionDef[]
): string[] {
  const fromVariants = variants
    .map((row) => row.optionValues[visualOption]?.trim())
    .filter((v): v is string => Boolean(v))
  const fromImages = Object.keys(colorImages)
  const fromOptions =
    normalizeProductOptions(productOptions).find((o) => o.title === visualOption)
      ?.values || []

  return Array.from(new Set([...fromOptions, ...fromVariants, ...fromImages]))
}

export function groupVariantsByVisualOption(
  variants: VariantMatrixRow[],
  visualOption: string
): Map<string, VariantMatrixRow[]> {
  const groups = new Map<string, VariantMatrixRow[]>()
  for (const row of variants) {
    const key = row.optionValues[visualOption]?.trim() || ""
    if (!key) continue
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }
  return groups
}

export function variantRowIndex(
  variants: VariantMatrixRow[],
  row: VariantMatrixRow
): number {
  if (row.id) {
    const byId = variants.findIndex((v) => v.id === row.id)
    if (byId >= 0) return byId
  }
  return variants.indexOf(row)
}

export function hasDuplicateCombo(
  variants: VariantMatrixRow[],
  optionTitles: string[],
  optionValues: Record<string, string>,
  excludeIndex?: number
): boolean {
  const key = variantComboKey(optionTitles, optionValues)
  return variants.some((row, idx) => {
    if (excludeIndex !== undefined && idx === excludeIndex) return false
    return variantComboKey(optionTitles, row.optionValues) === key
  })
}
