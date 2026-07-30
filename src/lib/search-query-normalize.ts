/** Common catalog misspellings → correct tokens. */
const TYPO_REWRITES: Record<string, string> = {
  celing: "ceiling",
  ceilling: "ceiling",
  cieling: "ceiling",
  ceeling: "ceiling",
  ceeiling: "ceiling",
  faan: "fan",
  fann: "fan",
  fane: "fan",
  fant: "fan",
  fenn: "fan",
  fn: "fan",
  miixer: "mixer",
  mixxer: "mixer",
  mixure: "mixer",
  frige: "fridge",
  frigde: "fridge",
  refridgerator: "refrigerator",
  refrigirator: "refrigerator",
  mobil: "mobile",
  labtop: "laptop",
  laptp: "laptop",
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
  geeyser: "geyser",
  geyserr: "geyser",
  indction: "induction",
  inducton: "induction",
  pressur: "pressure",
  presure: "pressure",
  cookr: "cooker",
  cookerr: "cooker",
  grindr: "grinder",
  grindrr: "grinder",
  grindor: "grinder",
  irn: "iron",
  iroon: "iron",
  ketle: "kettle",
  kettel: "kettle",
  blendr: "blender",
  blendar: "blender",
  coolr: "cooler",
  coler: "cooler",
  coolerr: "cooler",
  heatr: "heater",
  heaterr: "heater",
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Collapse runs of the same letter to at most `maxRun` (default 2).
 * e.g. faaaaan → faan, ceeeiling → ceeling
 */
export function collapseRepeatedLetters(
  token: string,
  maxRun = 2
): string {
  if (!token || maxRun < 1) return token
  let out = ""
  let prev = ""
  let run = 0
  for (const ch of token) {
    if (ch === prev) {
      run += 1
      if (run <= maxRun) out += ch
    } else {
      prev = ch
      run = 1
      out += ch
    }
  }
  return out
}

/** Apply token-wise catalog typo corrections (after repeat collapse). */
export function rewriteSearchTypos(query: string): string {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return ""
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      const collapsed = collapseRepeatedLetters(token)
      return TYPO_REWRITES[collapsed] || TYPO_REWRITES[token] || collapsed
    })
    .join(" ")
}
