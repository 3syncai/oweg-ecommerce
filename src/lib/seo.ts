import type { Metadata } from "next"
import type { DetailedProduct } from "@/lib/medusa"

export type BreadcrumbItem = {
  name: string
  path: string
}

function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      return configured.replace(/\/$/, "")
    }
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return "http://localhost:3000"
}

function absoluteUrl(path: string): string {
  const origin = getSiteOrigin()
  if (!path) return origin
  if (/^https?:\/\//i.test(path)) return path
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`
}

export function productDetailPath(handleOrId: string): string {
  const key = encodeURIComponent(String(handleOrId || "").trim())
  return `/productDetail/${key}`
}

function stripHtml(value?: string | null): string {
  if (!value) return ""
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function productDescription(product: DetailedProduct): string {
  const raw =
    product.subtitle ||
    stripHtml(product.description) ||
    `Buy ${product.title} at OWEG`
  return raw.slice(0, 300)
}

export function buildProductMetadata(product: DetailedProduct): Metadata {
  const path = productDetailPath(product.handle || product.id)
  const url = absoluteUrl(path)
  const description = productDescription(product)
  const images = (product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : []
  ).filter(Boolean)

  return {
    title: product.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url,
      images: images.slice(0, 4).map((src) => ({ url: absoluteUrl(src) })),
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: images.slice(0, 1).map((src) => absoluteUrl(src)),
    },
  }
}

export function buildProductJsonLd(product: DetailedProduct) {
  const path = productDetailPath(product.handle || product.id)
  const images = (product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : []
  )
    .filter(Boolean)
    .map((src) => absoluteUrl(src))

  const currency = (product.currency || "INR").toUpperCase()
  const inStock = product.variants?.some((v) => {
    if (v.allow_backorder) return true
    if (v.manage_inventory === false) return true
    return (v.inventory_quantity ?? 0) > 0
  })

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: productDescription(product),
    sku: product.id,
    url: absoluteUrl(path),
    image: images.length ? images : undefined,
    brand: {
      "@type": "Brand",
      name: "OWEG",
    },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(path),
      priceCurrency: currency,
      price: Number(product.price ?? 0),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  }
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: (items || []).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function serializeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c")
}
