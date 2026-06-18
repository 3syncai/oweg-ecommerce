export type CategoryMegaMenuFeatured = {
  headline: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
};

export type CategoryMegaMenuConfig = {
  popularSlugs: string[];
  featured: CategoryMegaMenuFeatured;
};

export const CATEGORY_MEGA_MENU_CONFIG: Record<string, CategoryMegaMenuConfig> = {
  "home-appliances": {
    popularSlugs: ["kettle", "iron", "mixer-grinders-and-juicer", "ceiling-fans"],
    featured: {
      headline: "Up to 40% off",
      subtitle: "Kitchen & Home Essentials",
      ctaLabel: "Shop Now",
      ctaHref: "/c/home-appliances",
    },
  },
  "kitchen-appliances": {
    popularSlugs: [
      "gas-stoves-and-hobs",
      "mixer-grinders-and-juicer",
      "inductions-and-cooktops",
      "pressure-cooker",
    ],
    featured: {
      headline: "Cook smarter",
      subtitle: "Top picks in Kitchen Appliances",
      ctaLabel: "Shop Now",
      ctaHref: "/c/kitchen-appliances",
    },
  },
  "computer-mobile-accessories": {
    popularSlugs: ["keyboards", "mouse", "speakers", "power-banks"],
    featured: {
      headline: "Tech essentials",
      subtitle: "Accessories for work & play",
      ctaLabel: "Shop Now",
      ctaHref: "/c/computer-mobile-accessories",
    },
  },
  "computer-and-mobile-accessories": {
    popularSlugs: ["keyboards", "mouse", "speakers", "power-banks"],
    featured: {
      headline: "Tech essentials",
      subtitle: "Accessories for work & play",
      ctaLabel: "Shop Now",
      ctaHref: "/c/computer-mobile-accessories",
    },
  },
  clothing: {
    popularSlugs: ["jackets", "jeans"],
    featured: {
      headline: "New arrivals",
      subtitle: "Fresh styles for every season",
      ctaLabel: "Shop Now",
      ctaHref: "/c/clothing",
    },
  },
};

export function getCategoryMegaMenuConfig(handle?: string): CategoryMegaMenuConfig | null {
  if (!handle) return null;
  const slug = handle.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return CATEGORY_MEGA_MENU_CONFIG[slug] ?? null;
}
