export type GstTaxCode = {
  code: string
  label: string
  rate: number
  description: string
}

/** Flipkart-style GST tax codes — used as UI fallback if API is down. */
export const GST_TAX_CODES: GstTaxCode[] = [
  { code: "GST_0", label: "GST_0", rate: 0, description: "Nil / exempt rated goods" },
  { code: "GST_0.25", label: "GST_0.25", rate: 0.25, description: "0.25% GST" },
  { code: "GST_3", label: "GST_3", rate: 3, description: "3% GST" },
  { code: "GST_5", label: "GST_5", rate: 5, description: "5% GST" },
  { code: "GST_12", label: "GST_12", rate: 12, description: "12% GST" },
  { code: "GST_18", label: "GST_18", rate: 18, description: "18% GST (most goods)" },
  { code: "GST_28", label: "GST_28", rate: 28, description: "28% GST" },
  { code: "GST_40", label: "GST_40", rate: 40, description: "40% GST" },
]

export function filterGstTaxCodes(query?: string | null): GstTaxCode[] {
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

export function suggestGstTaxCode(title?: string | null): GstTaxCode | null {
  const haystack = String(title || "").trim()
  if (!haystack) return GST_TAX_CODES.find((c) => c.code === "GST_18") || null

  const rules: Array<{ code: string; patterns: RegExp[] }> = [
    {
      code: "GST_5",
      patterns: [/\b(apparel|clothing|shoe|footwear|sandal|t-?shirt|shirt)\b/i],
    },
    { code: "GST_3", patterns: [/\b(gold|jewellery|jewelry)\b/i] },
    {
      code: "GST_18",
      patterns: [/\b(electronics|phone|laptop|jacket|hoodie|cosmetic)\b/i],
    },
    { code: "GST_28", patterns: [/\b(ac\b|air\s*conditioner|cement|car)\b/i] },
  ]

  for (const rule of rules) {
    if (rule.patterns.some((re) => re.test(haystack))) {
      return GST_TAX_CODES.find((c) => c.code === rule.code) || null
    }
  }
  return GST_TAX_CODES.find((c) => c.code === "GST_18") || null
}
