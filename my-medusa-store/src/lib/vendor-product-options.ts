export type ProductOptionInput = {
  title: string
  values: string[]
}

export type VariantInput = {
  title?: string
  sku?: string | null
  prices?: Array<{
    amount?: number | string
    currency_code?: string
    price_list_id?: string | null
  }>
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number
  metadata?: Record<string, unknown>
  options?: Record<string, string> | Array<{ value?: string } | string>
}

export function collectOptionValues(
  variants: Array<{ options?: Record<string, string> }>,
  key: string
): string[] {
  const values = new Set<string>()
  for (const variant of variants) {
    const optionValue = variant.options?.[key]
    if (optionValue) {
      values.add(optionValue)
    }
  }
  if (!values.size) {
    values.add("Default")
  }
  return Array.from(values)
}

function normalizePriceList(prices: VariantInput["prices"]): {
  prices: Array<{ amount: number; currency_code: string }>
  priceListPrices: Array<{ amount: number; currency_code: string; price_list_id: string }>
} {
  if (!prices || !Array.isArray(prices) || prices.length === 0) {
    return { prices: [], priceListPrices: [] }
  }

  const allPrices = prices
    .map((p) => {
      if (!p || typeof p !== "object") return null

      let amount = p.amount
      if (typeof amount === "string") {
        amount = parseFloat(amount)
      }

      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
        return null
      }

      const currency_code = (p.currency_code || "inr").toLowerCase()

      return {
        amount: Math.round(amount),
        currency_code,
        price_list_id: p.price_list_id || null,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  return {
    prices: allPrices
      .filter((p) => !p.price_list_id)
      .map((p) => ({ amount: p.amount, currency_code: p.currency_code })),
    priceListPrices: allPrices
      .filter((p) => p.price_list_id)
      .map((p) => ({
        amount: p.amount,
        currency_code: p.currency_code,
        price_list_id: p.price_list_id as string,
      })),
  }
}

function variantOptionsToMap(
  options: VariantInput["options"],
  optionTitles?: string[]
): Record<string, string> | null {
  if (!options) return null

  if (!Array.isArray(options) && typeof options === "object") {
    const map: Record<string, string> = {}
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === "string" && value.trim()) {
        map[key] = value.trim()
      }
    }
    return Object.keys(map).length > 0 ? map : null
  }

  if (Array.isArray(options) && optionTitles?.length) {
    const map: Record<string, string> = {}
    options.forEach((opt, index) => {
      const title = optionTitles[index]
      if (!title) return
      if (typeof opt === "string" && opt.trim()) {
        map[title] = opt.trim()
      } else if (typeof opt === "object" && opt?.value?.trim()) {
        map[title] = opt.value.trim()
      }
    })
    return Object.keys(map).length > 0 ? map : null
  }

  return null
}

function cleanVariantFields(v: VariantInput, optionMap: Record<string, string>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {
    title: v.title || "Default variant",
    options: optionMap,
  }

  if (v.sku && typeof v.sku === "string" && v.sku.trim()) {
    cleaned.sku = v.sku.trim()
  }

  const { prices, priceListPrices } = normalizePriceList(v.prices)
  cleaned.prices = prices

  if (priceListPrices.length > 0) {
    cleaned.metadata = { ...(v.metadata || {}), _price_list_prices: priceListPrices }
  } else if (v.metadata) {
    cleaned.metadata = v.metadata
  }

  if (typeof v.manage_inventory === "boolean") {
    cleaned.manage_inventory = v.manage_inventory
  }

  if (typeof v.allow_backorder === "boolean") {
    cleaned.allow_backorder = v.allow_backorder
  }

  if (typeof v.inventory_quantity === "number") {
    cleaned.inventory_quantity = v.inventory_quantity
  }

  return cleaned
}

function normalizeProductOptions(
  options: ProductOptionInput[] | undefined | null
): ProductOptionInput[] {
  if (!options || !Array.isArray(options)) return []

  return options
    .map((opt) => {
      const title = typeof opt?.title === "string" ? opt.title.trim() : ""
      if (!title) return null

      const values = Array.isArray(opt.values)
        ? opt.values
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
        : []

      const uniqueValues = Array.from(new Set(values))
      if (!uniqueValues.length) return null

      return { title, values: uniqueValues }
    })
    .filter((opt): opt is ProductOptionInput => opt !== null)
}

function deriveOptionsFromVariants(
  variants: Array<{ options?: Record<string, string> }>
): ProductOptionInput[] {
  const optionValues = new Map<string, Set<string>>()

  for (const variant of variants) {
    if (!variant.options) continue
    for (const [title, value] of Object.entries(variant.options)) {
      if (!title.trim() || !value.trim()) continue
      if (!optionValues.has(title)) {
        optionValues.set(title, new Set())
      }
      optionValues.get(title)!.add(value.trim())
    }
  }

  return Array.from(optionValues.entries()).map(([title, values]) => ({
    title,
    values: Array.from(values),
  }))
}

export function normalizeOptionsAndVariants(
  options: ProductOptionInput[] | undefined | null,
  variants: VariantInput[] | undefined | null
): {
  options: ProductOptionInput[]
  variants: Record<string, unknown>[]
  error?: string
} {
  let inputVariants = Array.isArray(variants) ? [...variants] : []

  if (inputVariants.length === 0) {
    inputVariants = [{ title: "Default variant", prices: [] }]
  }

  let finalOptions = normalizeProductOptions(options)
  const optionTitles = finalOptions.map((opt) => opt.title)

  const variantsWithMaps = inputVariants.map((v) => {
    const optionMap = variantOptionsToMap(v.options, optionTitles.length ? optionTitles : undefined)
    return { raw: v, optionMap }
  })

  const hasExplicitVariantOptions = variantsWithMaps.some((v) => v.optionMap !== null)

  if (finalOptions.length === 0 && hasExplicitVariantOptions) {
    const derivedMaps = variantsWithMaps.map((v) => v.optionMap!).filter(Boolean)
    finalOptions = deriveOptionsFromVariants(derivedMaps.map((m) => ({ options: m })))
  }

  if (finalOptions.length === 0 && inputVariants.length === 1) {
    finalOptions = [{ title: "Default", values: ["Default"] }]
    const cleaned = cleanVariantFields(inputVariants[0], { Default: "Default" })
    return { options: finalOptions, variants: [cleaned] }
  }

  if (finalOptions.length === 0 && inputVariants.length > 1) {
    finalOptions = [{ title: "Variant", values: [] }]
    const mappedVariants = inputVariants.map((v) => {
      const value = (v.title ?? "Default").trim() || "Default"
      return cleanVariantFields(v, { Variant: value })
    })
    finalOptions = [
      {
        title: "Variant",
        values: collectOptionValues(
          mappedVariants.map((v) => ({ options: v.options as Record<string, string> })),
          "Variant"
        ),
      },
    ]
    return { options: finalOptions, variants: mappedVariants }
  }

  const updatedOptionTitles = finalOptions.map((opt) => opt.title)
  const finalVariants: Record<string, unknown>[] = []

  for (const { raw, optionMap } of variantsWithMaps) {
    let resolvedMap = optionMap || {}

    if (Object.keys(resolvedMap).length === 0) {
      if (updatedOptionTitles.length === 1 && updatedOptionTitles[0] === "Default") {
        resolvedMap = { Default: "Default" }
      } else {
        return {
          options: finalOptions,
          variants: [],
          error: `Variant "${raw.title || "untitled"}" is missing option values`,
        }
      }
    }

    for (const title of updatedOptionTitles) {
      if (!resolvedMap[title]) {
        return {
          options: finalOptions,
          variants: [],
          error: `Variant "${raw.title || "untitled"}" is missing value for option "${title}"`,
        }
      }
    }

    finalVariants.push(cleanVariantFields(raw, resolvedMap))
  }

  finalOptions = finalOptions.map((opt) => ({
    title: opt.title,
    values: collectOptionValues(
      finalVariants.map((v) => ({ options: v.options as Record<string, string> })),
      opt.title
    ),
  }))

  const comboKeys = new Set<string>()
  for (const variant of finalVariants) {
    const key = updatedOptionTitles
      .map((title) => (variant.options as Record<string, string>)[title])
      .join("|")
    if (comboKeys.has(key)) {
      return {
        options: finalOptions,
        variants: [],
        error: `Duplicate variant option combination: ${key.replace(/\|/g, ", ")}`,
      }
    }
    comboKeys.add(key)
  }

  return { options: finalOptions, variants: finalVariants }
}
