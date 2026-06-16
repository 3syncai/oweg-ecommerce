const VISUAL_OPTION_PATTERN = /color|colour|pattern|finish|shade|style/i

export function detectVisualOption(optionTitles: string[]): string | undefined {
  if (!optionTitles.length) return undefined
  const match = optionTitles.find((title) => VISUAL_OPTION_PATTERN.test(title))
  return match || optionTitles[0]
}

function findCanonicalOptionValue(value: string, optionValues: Set<string>): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (optionValues.has(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  for (const opt of optionValues) {
    if (opt.toLowerCase() === lower) return opt
  }
  return null
}

export function resolveColorImagesForValue(
  value: string,
  colorImages: Record<string, string[]>
): string[] | undefined {
  if (!value?.trim() || !colorImages) return undefined
  const trimmed = value.trim()
  if (colorImages[trimmed]?.length) return colorImages[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [key, urls] of Object.entries(colorImages)) {
    if (key.toLowerCase() === lower && urls.length) return urls
  }
  return undefined
}

export function sanitizeColorImages(
  colorImages: unknown,
  optionValues: Set<string>
): Record<string, string[]> {
  if (!colorImages || typeof colorImages !== "object" || Array.isArray(colorImages)) {
    return {}
  }

  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(colorImages as Record<string, unknown>)) {
    if (!key.trim()) continue

    const canonical =
      optionValues.size > 0 ? findCanonicalOptionValue(key, optionValues) : key.trim()

    if (optionValues.size > 0 && !canonical) {
      console.warn(`Skipping color_images key "${key}" — not a valid option value`)
      continue
    }

    const storeKey = canonical || key.trim()
    const urls = Array.isArray(value)
      ? value.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : []

    if (!urls.length) continue

    result[storeKey] = result[storeKey] ? Array.from(new Set([...result[storeKey], ...urls])) : urls
  }
  return result
}

export function collectOptionValuesFromProductOptions(
  options: Array<{ title?: string; values?: Array<{ value?: string } | string> | string[] }> | undefined
): Set<string> {
  const values = new Set<string>()
  if (!options?.length) return values
  for (const opt of options) {
    const title = typeof opt.title === "string" ? opt.title.trim() : ""
    if (!title) continue
    if (VISUAL_OPTION_PATTERN.test(title)) {
      for (const entry of opt.values || []) {
        const value = typeof entry === "string" ? entry : entry?.value
        if (typeof value === "string" && value.trim()) values.add(value.trim())
      }
    }
  }
  return values
}

export function parseColorImagesFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string[]> {
  const raw = metadata?.color_images
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const urls = value.filter((url): url is string => typeof url === "string" && url.trim())
    if (urls.length) result[key] = urls
  }
  return result
}

export function parsePrimaryVisualOptionFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  optionTitles: string[] = []
): string | undefined {
  const fromMeta = metadata?.primary_visual_option
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim()
  }
  return detectVisualOption(optionTitles)
}

export function attachVariantThumbnails(
  variants: Record<string, unknown>[],
  colorImages: Record<string, string[]>,
  visualOption: string | undefined
): Record<string, unknown>[] {
  if (!visualOption || !colorImages || Object.keys(colorImages).length === 0) {
    return variants
  }

  return variants.map((variant) => {
    const options = variant.options as Record<string, string> | undefined
    const visualValue = options?.[visualOption]
    if (!visualValue) return variant
    const urls = resolveColorImagesForValue(visualValue, colorImages)
    const thumbnail = urls?.[0]
    if (!thumbnail) return variant
    return { ...variant, thumbnail }
  })
}
