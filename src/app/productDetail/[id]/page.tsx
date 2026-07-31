import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ProductDetailPage from "../productDetail"
import { fetchProductDetail, type DetailedProduct } from "@/lib/medusa"
import {
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetadata,
  productDetailPath,
  serializeJsonLd,
} from "@/lib/seo"

export const revalidate = 300

type Params = {
  id: string
}

type SearchParams = {
  id?: string
}

async function resolveProduct(
  slug: string,
  queryId?: string
): Promise<{ product: DetailedProduct; resolvedKey: string } | null> {
  const productIdFromQuery = decodeURIComponent(queryId || "")
  const slugValue = decodeURIComponent(slug || "")

  let resolvedKey = productIdFromQuery || slugValue
  let product = resolvedKey
    ? await fetchProductDetail(resolvedKey, { bypassCache: true })
    : null

  if (!product && productIdFromQuery && slugValue && productIdFromQuery !== slugValue) {
    product = await fetchProductDetail(slugValue, { bypassCache: true })
    if (product) {
      resolvedKey = slugValue
    }
  }

  if (!product) return null
  return { product, resolvedKey }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const [{ id: slug }, query] = await Promise.all([params, searchParams])
  const resolved = await resolveProduct(slug, query.id)

  if (!resolved) {
    return {
      title: "Product Not Found",
      robots: { index: false, follow: false },
    }
  }

  return buildProductMetadata(resolved.product)
}

export default async function ProductDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const [{ id: slug }, query] = await Promise.all([params, searchParams])
  const resolved = await resolveProduct(slug, query.id)

  if (!resolved) {
    notFound()
  }

  const { product, resolvedKey } = resolved
  const category = product.categories?.[0]
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    ...(category
      ? [
          {
            name: category.title,
            path: category.handle
              ? `/c/${encodeURIComponent(category.handle)}`
              : `/c/${encodeURIComponent(category.id)}`,
          },
        ]
      : []),
    {
      name: product.title,
      path: productDetailPath(product.handle || product.id),
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd([
            buildProductJsonLd(product),
            buildBreadcrumbJsonLd(breadcrumbItems),
          ]),
        }}
      />
      <ProductDetailPage productId={resolvedKey} initialProduct={product} />
    </>
  )
}
