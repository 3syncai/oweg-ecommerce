/**
 * SKU generation utilities for bulk product upload.
 *
 * Format: <BRAND_3>-<PRODUCT_2><RANDOM_DIGITS>
 *   - BRAND_3: First 3 alphanumeric characters of brand (uppercase, padded with X if shorter)
 *   - PRODUCT_2: First 2 alphanumeric characters of product title (uppercase, padded with X)
 *   - RANDOM_DIGITS: 6 random digits to keep the SKU unique
 *
 * Example: brand="Nike", product="Winter jacket" -> "NIK-WI348215"
 */

const sanitizeAlpha = (input: string): string => {
  return (input || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
}

const padOrSlice = (input: string, length: number, padChar = "X"): string => {
  const safe = sanitizeAlpha(input)
  if (safe.length >= length) return safe.slice(0, length)
  return (safe + padChar.repeat(length)).slice(0, length)
}

const randomDigits = (count: number): string => {
  let out = ""
  for (let i = 0; i < count; i++) {
    out += Math.floor(Math.random() * 10).toString()
  }
  return out
}

export const buildSkuPrefix = (brand: string, productTitle: string): string => {
  const brandPart = padOrSlice(brand || "GEN", 3)
  const productPart = padOrSlice(productTitle || "PR", 2)
  return `${brandPart}-${productPart}`
}

/**
 * Generate a unique SKU. Pass an optional `usedSkus` Set so consecutive calls
 * within the same batch never collide with each other.
 */
export const generateSku = (
  brand: string,
  productTitle: string,
  usedSkus?: Set<string>
): string => {
  const prefix = buildSkuPrefix(brand, productTitle)
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}${randomDigits(6)}`
    if (!usedSkus || !usedSkus.has(candidate)) {
      usedSkus?.add(candidate)
      return candidate
    }
  }
  // Extremely unlikely fallback: extend with timestamp tail to guarantee uniqueness
  const fallback = `${prefix}${randomDigits(4)}${Date.now().toString().slice(-4)}`
  usedSkus?.add(fallback)
  return fallback
}

/**
 * Validate that a SKU follows the expected vendor format.
 * Used to decide whether to keep a vendor-supplied SKU or auto-generate.
 */
export const isValidSkuFormat = (sku: string): boolean => {
  if (!sku || typeof sku !== "string") return false
  return /^[A-Z0-9]{3}-[A-Z0-9]{2}[A-Z0-9]{4,}$/.test(sku.trim())
}
