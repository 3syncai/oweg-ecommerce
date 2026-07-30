/**
 * Shared typo → rewrite → baseline fixture for unit + live search tests.
 * Keep baselines tied to catalog terms that usually have hits.
 */
export type TypoTestCase = {
  typo: string
  /** Expected output of rewriteSearchTypos(typo) */
  expected: string
  /** Correct search query used as live baseline */
  baseline: string
}

export const TYPO_CASES: TypoTestCase[] = [
  // --- single-token (fan / ceiling / mixer / cooker / geyser) ---
  { typo: "faaaaan", expected: "fan", baseline: "fan" },
  { typo: "fane", expected: "fan", baseline: "fan" },
  { typo: "faan", expected: "fan", baseline: "fan" },
  { typo: "fant", expected: "fan", baseline: "fan" },
  { typo: "Celing", expected: "ceiling", baseline: "ceiling" },
  { typo: "cieling", expected: "ceiling", baseline: "ceiling" },
  { typo: "ceilling", expected: "ceiling", baseline: "ceiling" },
  { typo: "ceeeiling", expected: "ceiling", baseline: "ceiling" },
  { typo: "miixer", expected: "mixer", baseline: "mixer" },
  { typo: "mixxxer", expected: "mixer", baseline: "mixer" },
  { typo: "mixure", expected: "mixer", baseline: "mixer" },
  { typo: "cookr", expected: "cooker", baseline: "cooker" },
  { typo: "cookerr", expected: "cooker", baseline: "cooker" },
  { typo: "geysir", expected: "geyser", baseline: "geyser" },
  { typo: "geeyser", expected: "geyser", baseline: "geyser" },

  // --- induction / microwave / keyboard / speaker / camera ---
  { typo: "indction", expected: "induction", baseline: "induction" },
  { typo: "inducton", expected: "induction", baseline: "induction" },
  { typo: "micowave", expected: "microwave", baseline: "microwave" },
  { typo: "microvawe", expected: "microwave", baseline: "microwave" },
  { typo: "keybord", expected: "keyboard", baseline: "keyboard" },
  { typo: "keybaord", expected: "keyboard", baseline: "keyboard" },
  { typo: "speeker", expected: "speaker", baseline: "speaker" },
  { typo: "speker", expected: "speaker", baseline: "speaker" },
  { typo: "camra", expected: "camera", baseline: "camera" },
  { typo: "cameras", expected: "camera", baseline: "camera" },

  // --- laptop / bluetooth / iron / kettle / blender ---
  { typo: "labtop", expected: "laptop", baseline: "laptop" },
  { typo: "laptp", expected: "laptop", baseline: "laptop" },
  { typo: "blutooth", expected: "bluetooth", baseline: "bluetooth" },
  { typo: "bluetooh", expected: "bluetooth", baseline: "bluetooth" },
  { typo: "irn", expected: "iron", baseline: "iron" },
  { typo: "iroon", expected: "iron", baseline: "iron" },
  { typo: "ketle", expected: "kettle", baseline: "kettle" },
  { typo: "kettel", expected: "kettle", baseline: "kettle" },
  { typo: "blendr", expected: "blender", baseline: "blender" },
  { typo: "blendar", expected: "blender", baseline: "blender" },

  // --- pressure / cooler / heater / grinder ---
  { typo: "pressur", expected: "pressure", baseline: "pressure" },
  { typo: "presure", expected: "pressure", baseline: "pressure" },
  { typo: "coolr", expected: "cooler", baseline: "cooler" },
  { typo: "coler", expected: "cooler", baseline: "cooler" },
  { typo: "heatr", expected: "heater", baseline: "heater" },
  { typo: "heaterr", expected: "heater", baseline: "heater" },
  { typo: "grindr", expected: "grinder", baseline: "grinder" },
  { typo: "grindrr", expected: "grinder", baseline: "grinder" },

  // --- multi-token typos ---
  { typo: "celing fane", expected: "ceiling fan", baseline: "ceiling fan" },
  { typo: "celing faan", expected: "ceiling fan", baseline: "ceiling fan" },
  { typo: "pressur cookr", expected: "pressure cooker", baseline: "pressure cooker" },
  { typo: "indction cookr", expected: "induction cooker", baseline: "induction cooker" },
  { typo: "miixer grindr", expected: "mixer grinder", baseline: "mixer grinder" },
  { typo: "mixxxer grindr", expected: "mixer grinder", baseline: "mixer grinder" },
  { typo: "micowave oven", expected: "microwave oven", baseline: "microwave oven" },
  { typo: "cieling faaaaan", expected: "ceiling fan", baseline: "ceiling fan" },
  { typo: "coolr geysir", expected: "cooler geyser", baseline: "cooler geyser" },
  { typo: "ketle heatr", expected: "kettle heater", baseline: "kettle heater" },
]
