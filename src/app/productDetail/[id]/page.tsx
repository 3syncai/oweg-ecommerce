import ProductDetailPage from "../productDetail"

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
  return <ProductDetailPage productId={productId} />
}
