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
  "rj-denim": "/rj-denim.png",
  "sassiest": "/sassiest.png",
  "nirlep": "/nirlep.png",
  "gilma": "/gilma.png",
  "hyatt": "/hyatt.png",
  "oweg": "/oweg_brand.png",
};

const logoScaleMap: Record<string, number> = {
  paras: 1.2,
};

export const fallbackLogo = "/oweg_logo.png";

export type BrandLogoInput = {
  title?: string | null;
  handle?: string | null;
  logoUrl?: string | null;
  logoScale?: number | null;
};

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
  const candidates = [normalizeBrandKey(handle), normalizeBrandKey(title)].filter(Boolean);

  for (const key of candidates) {
    if (logoMap[key]) return logoMap[key];
    const compressed = key.replace(/-/g, "");
    if (logoMap[compressed]) return logoMap[compressed];
  }

  return fallbackLogo;
}

export function getBrandLogoScale(title?: string | null, handle?: string | null) {
  const candidates = [normalizeBrandKey(handle), normalizeBrandKey(title)].filter(Boolean);
  for (const key of candidates) {
    if (logoScaleMap[key]) return logoScaleMap[key];
  }
  return 1;
}

export function resolveBrandLogo(input: BrandLogoInput) {
  const logoUrl = input.logoUrl?.trim();
  if (logoUrl) {
    return {
      src: logoUrl,
      scale:
        typeof input.logoScale === "number" && input.logoScale > 0
          ? input.logoScale
          : getBrandLogoScale(input.title, input.handle),
    };
  }

  return {
    src: getBrandLogoPath(input.title, input.handle),
    scale: getBrandLogoScale(input.title, input.handle),
  };
}

export function getCollectionLogoUrl(metadata?: Record<string, unknown> | null): string | undefined {
  const url = metadata?.brand_logo_url;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

export function getCollectionLogoScale(metadata?: Record<string, unknown> | null): number | undefined {
  const raw = metadata?.brand_logo_scale;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
