import type { MetadataRoute } from "next";
import {
  collectCategorySitemapPaths,
  fetchCategories,
  fetchProductSitemapEntries,
} from "@/lib/medusa";
import { absoluteUrl } from "@/lib/site-url";

export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/search", changeFrequency: "daily", priority: 0.9 },
  { path: "/brands", changeFrequency: "weekly", priority: 0.8 },
  { path: "/specials", changeFrequency: "daily", priority: 0.8 },
  { path: "/for-you", changeFrequency: "daily", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/shipping-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/returns-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/coupon-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/reward-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/gift-card", changeFrequency: "monthly", priority: 0.4 },
  { path: "/affiliates", changeFrequency: "monthly", priority: 0.4 },
  { path: "/seller-registration", changeFrequency: "monthly", priority: 0.4 },
  { path: "/agent-registration", changeFrequency: "monthly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [categories, products] = await Promise.all([
      fetchCategories({ revalidate }),
      fetchProductSitemapEntries(revalidate),
    ]);

    for (const path of collectCategorySitemapPaths(categories)) {
      entries.push({
        url: absoluteUrl(path),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const product of products) {
      entries.push({
        url: absoluteUrl(`/products/${product.handle}`),
        lastModified: product.updatedAt ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (error) {
    console.error("sitemap generation partial failure", error);
  }

  return entries;
}
