/** Common catalog misspellings → correct tokens. */
const TYPO_REWRITES: Record<string, string> = {
  celing: "ceiling",
  ceilling: "ceiling",
  cieling: "ceiling",
  faan: "fan",
  fann: "fan",
  miixer: "mixer",
  mixure: "mixer",
  frige: "fridge",
  frigde: "fridge",
  refridgerator: "refrigerator",
  refrigirator: "refrigerator",
  mobil: "mobile",
  labtop: "laptop",
  lenevo: "lenovo",
  samgung: "samsung",
  samung: "samsung",
  keybord: "keyboard",
  keybaord: "keyboard",
  speeker: "speaker",
  speker: "speaker",
  camra: "camera",
  cameras: "camera",
  blutooth: "bluetooth",
  bluetooh: "bluetooth",
  micowave: "microwave",
  microvawe: "microwave",
  geysir: "geyser",
  indction: "induction",
  pressur: "pressure",
  cookr: "cooker",
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}

/** Apply token-wise catalog typo corrections. */
export function rewriteSearchTypos(query: string): string {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return ""
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => TYPO_REWRITES[token] || token)
    .join(" ")
}
