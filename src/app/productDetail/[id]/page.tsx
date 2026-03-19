import { notFound } from "next/navigation"
import ProductDetailPage from "../productDetail"
import { fetchProductDetail } from "@/lib/medusa"

export const revalidate = 300

type Params = {
  id: string
}

type SearchParams = {
  id?: string
}

export default async function ProductDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const [{ id: slug }, query] = await Promise.all([params, searchParams])
  const productIdFromQuery = decodeURIComponent(query.id || "")
  const slugValue = decodeURIComponent(slug || "")

  let resolvedKey = productIdFromQuery || slugValue
  let initialProduct = resolvedKey ? await fetchProductDetail(resolvedKey, { bypassCache: true }) : null

  // Fallback: if query `id` is stale (e.g. pending/draft old product) but slug is valid, try slug.
  if (!initialProduct && productIdFromQuery && slugValue && productIdFromQuery !== slugValue) {
    initialProduct = await fetchProductDetail(slugValue, { bypassCache: true })
    if (initialProduct) {
      resolvedKey = slugValue
    }
  }

  if (!initialProduct) {
    notFound()
  }
  return <ProductDetailPage productId={resolvedKey} initialProduct={initialProduct} />
}
