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
  const preferredId = query.id || slug || ""
  const productId = decodeURIComponent(preferredId)
  const initialProduct = await fetchProductDetail(productId)
  if (!initialProduct) {
    notFound()
  }
  return <ProductDetailPage productId={productId} initialProduct={initialProduct} />
}
