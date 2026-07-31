/**
 * OWEG GST tax codes for product listings (Flipkart-style Tax Code).
 * Served by GET /vendor/gst/tax-codes — no third-party key required.
 */

export type GstTaxCode = {
  code: string
  label: string
  rate: number
  description: string
}

export const GST_TAX_CODES: GstTaxCode[] = [
  {
    code: "GST_0",
    label: "GST_0",
    rate: 0,
    description: "Nil / exempt rated goods",
  },
  {
    code: "GST_0.25",
    label: "GST_0.25",
    rate: 0.25,
    description: "0.25% GST (e.g. rough precious stones)",
  },
  {
    code: "GST_3",
    label: "GST_3",
    rate: 3,
    description: "3% GST (e.g. gold / jewellery related)",
  },
  {
    code: "GST_5",
    label: "GST_5",
    rate: 5,
    description: "5% GST",
  },
  {
    code: "GST_12",
    label: "GST_12",
    rate: 12,
    description: "12% GST",
  },
  {
    code: "GST_18",
    label: "GST_18",
    rate: 18,
    description: "18% GST (most goods)",
  },
  {
    code: "GST_28",
    label: "GST_28",
    rate: 28,
    description: "28% GST",
  },
  {
    code: "GST_40",
    label: "GST_40",
    rate: 40,
    description: "40% GST (sin / luxury category where applicable)",
  },
]

/** Simple keyword → suggested tax code (best-effort, not legal advice). */
const SUGGEST_RULES: Array<{ code: string; patterns: RegExp[] }> = [
  {
    code: "GST_5",
    patterns: [
      /\b(apparel|clothing|garment|t-?shirt|shirt|kurta|saree|sari|footwear|shoe|sandal|slipper)\b/i,
      /\b(food|atta|rice|flour|milk|paneer|tea|coffee)\b/i,
    ],
  },
  {
    code: "GST_3",
    patterns: [/\b(gold|jewellery|jewelry|ornament|bullion)\b/i],
  },
  {
    code: "GST_12",
    patterns: [/\b(butter|ghee|mobile\s*cover|phone\s*case|bag|handbag)\b/i],
  },
  {
    code: "GST_18",
    patterns: [
      /\b(electronics|laptop|phone|mobile|tablet|headphone|earbud|speaker|camera)\b/i,
      /\b(jacket|hoodie|sweater|winter|furniture|appliance)\b/i,
      /\b(cosmetic|shampoo|soap|cream|perfume)\b/i,
    ],
  },
  {
    code: "GST_28",
    patterns: [/\b(ac\b|air\s*conditioner|washing\s*machine|cement|car|automobile)\b/i],
  },
  {
    code: "GST_0",
    patterns: [/\b(fresh\s*fruit|fresh\s*vegetable|unbranded\s*atta)\b/i],
  },
]

export function findGstTaxCode(code: string | null | undefined): GstTaxCode | null {
  if (!code) return null
  const normalized = String(code).trim().toUpperCase()
  return GST_TAX_CODES.find((c) => c.code === normalized || c.label === normalized) || null
}

export function searchGstTaxCodes(query?: string | null): GstTaxCode[] {
  const q = String(query || "").trim().toLowerCase()
  if (!q) return GST_TAX_CODES
  return GST_TAX_CODES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      String(c.rate).includes(q) ||
      c.description.toLowerCase().includes(q)
  )
}

export function suggestGstTaxCode(input: {
  title?: string | null
  description?: string | null
  category?: string | null
}): GstTaxCode | null {
  const haystack = [input.title, input.description, input.category]
    .filter(Boolean)
    .join(" ")
    .trim()
  if (!haystack) return findGstTaxCode("GST_18")

  for (const rule of SUGGEST_RULES) {
    if (rule.patterns.some((re) => re.test(haystack))) {
      return findGstTaxCode(rule.code)
    }
  }
  return findGstTaxCode("GST_18")
}
