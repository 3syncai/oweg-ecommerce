const logoMap: Record<string, string> = {
  "bajaj": "/Bajaj.png",
  "blue-star": "/Bluestar.png",
  "bluestar": "/Bluestar.png",
  "crompton": "/Crompton.png",
  "frontech": "/Frontech.png",
  "generic": "/Genric.png",
  "genric": "/Genric.png",
  "maharaja": "/Maharaja.png",
  "microtek": "/Microtek.png",
  "m-pro": "/M_Pro.png",
  "m_pro": "/M_Pro.png",
  "nelkon": "/Nelkon.png",
  "nnex": "/NNEX.png",
  "paras": "/Paras.png",
  "pigeon": "/Pigeon.png",
  "pureit": "/Pureit.png",
  "secureye": "/Secureye.png",
  "syska": "/Syska.png",
  "usha": "/Usha.png",
  "mpro": "/M_Pro.png",
  "rj-denim":"/rj-denim.png",
  "sassiest":"/sassiest.png",
  "nirlep":"/nirlep.png",
  "gilma":"/gilma.png",
  "hyatt":"/hyatt.png",
  "oweg":"/oweg_brand.png"
};

// Per-brand scale tweaks to better fit logos in uniform containers
const logoScaleMap: Record<string, number> = {
  "paras": 1.2,
};

export const fallbackLogo = "/oweg_logo.png";

export function normalizeBrandKey(value?: string | null) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getBrandLogoPath(title?: string | null, handle?: string | null) {
  const candidates = [
    normalizeBrandKey(handle),
    normalizeBrandKey(title),
  ].filter(Boolean);

  // Try direct map
  for (const key of candidates) {
    if (logoMap[key]) return logoMap[key];
    const compressed = key.replace(/-/g, "");
    if (logoMap[compressed]) return logoMap[compressed];
  }

  return fallbackLogo;
}

export function getBrandLogoScale(title?: string | null, handle?: string | null) {
  const candidates = [
    normalizeBrandKey(handle),
    normalizeBrandKey(title),
  ].filter(Boolean);
  for (const key of candidates) {
    if (logoScaleMap[key]) return logoScaleMap[key];
  }
  return 1;
}
