export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase()
}

export type InventorySkuSource = {
  product_id?: string
  variant_sku?: string | null
}

export function buildUsedSkuSet(
  items: InventorySkuSource[],
  excludeProductId?: string
): Set<string> {
  const set = new Set<string>()
  for (const item of items) {
    if (excludeProductId && item.product_id === excludeProductId) continue
    const sku = item.variant_sku?.trim()
    if (sku) set.add(normalizeSku(sku))
  }
  return set
}

export function validateProductSkus(
  skus: string[],
  usedSkus: Set<string>
): { ok: true } | { ok: false; title: string; description: string } {
  const entries = skus.map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()

  for (const sku of entries) {
    const normalized = normalizeSku(sku)
    if (seen.has(normalized)) {
      return {
        ok: false,
        title: "Duplicate SKU",
        description: `"${sku}" is used on more than one variant in this product. Each variant needs a unique SKU.`,
      }
    }
    seen.add(normalized)
  }

  for (const sku of entries) {
    if (usedSkus.has(normalizeSku(sku))) {
      return {
        ok: false,
        title: "SKU already in use",
        description: `"${sku}" is already used on another product. Enter a different SKU or leave it blank.`,
      }
    }
  }

  return { ok: true }
}

export function validateSingleSkuInput(
  sku: string,
  rowIndex: number,
  allSkus: string[],
  usedSkus?: Set<string>
): { ok: true } | { ok: false; title: string; description: string } {
  const trimmed = sku.trim()
  if (!trimmed) return { ok: true }

  const normalized = normalizeSku(trimmed)
  const duplicateInForm = allSkus.some(
    (value, index) => index !== rowIndex && value.trim() && normalizeSku(value) === normalized
  )

  if (duplicateInForm) {
    return {
      ok: false,
      title: "Duplicate SKU",
      description: `"${trimmed}" is already used on another variant in this product.`,
    }
  }

  if (usedSkus?.has(normalized)) {
    return {
      ok: false,
      title: "SKU already in use",
      description: `"${trimmed}" is already used on another product. Choose a different SKU or leave blank.`,
    }
  }

  return { ok: true }
}
