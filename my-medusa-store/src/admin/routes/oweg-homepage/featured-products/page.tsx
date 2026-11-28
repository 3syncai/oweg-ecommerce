"use client"

import { useEffect, useState } from "react"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { adminFetch } from "../../../lib/admin-auth-fetch"
import { readAdminApiError } from "../../../lib/admin-backend"
import { parseFeaturedProducts, type FeaturedProductsConfig, type FeaturedPickerProduct } from "../../../../shared/featured-products"

type Product = FeaturedPickerProduct
type SearchPage = { term: string; cursor: string | null; previous: Array<string | null> }
type Published = { config: FeaturedProductsConfig; revision: string | null; products: Product[] }
const endpoint = "/admin/featured-products"
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })

function ProductPreview({ product }: { product: Product }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const productPath = `/products/${encodeURIComponent(product.id)}`
  const thumbnail = (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted">
      {product.thumbnail && product.thumbnail !== failedImage ? (
        <img src={product.thumbnail} alt="" width={48} height={48} loading="lazy" decoding="async"
          className="h-full w-full object-contain" onError={() => setFailedImage(product.thumbnail)} />
      ) : <span aria-hidden="true">—</span>}
    </span>
  )
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {product.status === "missing" ? thumbnail : (
        <Link to={productPath} target="_blank" rel="noopener" className="shrink-0 rounded-md"
          aria-label={`Open ${product.title} details in a new tab`}>{thumbnail}</Link>
      )}
      <div className="min-w-0 break-words text-sm">
        {product.status === "missing" ? <p className="font-medium">{product.title}</p> : (
          <Link to={productPath} target="_blank" rel="noopener" className="font-medium text-ui-fg-interactive hover:underline">
            {product.title}
          </Link>
        )}
        <p className="text-xs leading-relaxed text-ui-fg-subtle">{product.vendor || "Vendor unavailable"}</p>
        <dl className="flex flex-wrap gap-x-4 text-xs leading-relaxed text-ui-fg-subtle">
          <div className="flex gap-1">
            <dt>MRP</dt>
            <dd>{product.mrp === null ? "unavailable" : `${product.has_mrp_range ? "from " : ""}${money.format(product.mrp)}`}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Vendor selling price</dt>
            <dd>{product.selling_price === null ? "unavailable" :
              `${product.has_selling_price_range ? "from " : ""}${money.format(product.selling_price)}`}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export default function FeaturedProductsPage() {
  const [published, setPublished] = useState<Published | null>(null)
  const [title, setTitle] = useState("")
  const [selected, setSelected] = useState<Product[]>([])
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState<SearchPage>({ term: "", cursor: null, previous: [] })
  const [results, setResults] = useState<Product[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [invalidIds, setInvalidIds] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await adminFetch(endpoint, { signal: controller.signal })
        if (!response.ok) throw new Error(await readAdminApiError(response, "Unable to load featured products"))
        const data: Published = await response.json()
        if (controller.signal.aborted) return
        const products = new Map(data.products.map(product => [product.id, product]))
        setPublished(data)
        setTitle(data.config.title)
        setSelected(data.config.product_ids.map(id => products.get(id) ?? { id, title: id, status: "missing", thumbnail: null, vendor: null, mrp: null, selling_price: null, has_mrp_range: false, has_selling_price_range: false }))
        setInvalidIds([])
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load featured products.")
      }
    }
    void load()
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: search.term })
    if (search.cursor) params.set("cursor", search.cursor)
    async function load() {
      try {
        const response = await adminFetch(endpoint + "/catalog?" + params, { signal: controller.signal })
        if (!response.ok) throw new Error(await readAdminApiError(response, "Unable to search products"))
        const data: { products: Product[]; next_cursor: string | null } = await response.json()
        if (!controller.signal.aborted) {
          setResults(data.products)
          setNextCursor(data.next_cursor)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "Unable to search products.")
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [search])

  function findProducts(page: SearchPage) {
    setSearchError("")
    setSearching(true)
    setSearch(page)
  }

  function edit(next: Product[]) {
    setSelected(next)
    setNotice("")
    setInvalidIds(ids => ids.filter(id => next.some(product => product.id === id)))
  }

  function move(index: number, step: number) {
    const next = [...selected]
    const [product] = next.splice(index, 1)
    next.splice(index + step, 0, product)
    edit(next)
  }

  async function publish() {
    if (!published || saving) return
    const config = parseFeaturedProducts({ title, product_ids: selected.map(product => product.id) })
    if (!config) {
      setError("Enter a title and select unique products.")
      return
    }
    setSaving(true)
    setError("")
    setNotice("")
    setInvalidIds([])
    try {
      const response = await adminFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, revision: published.revision }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setInvalidIds(Array.isArray(body?.invalid_product_ids) ? body.invalid_product_ids : [])
        throw new Error(body?.message || "Unable to publish featured products.")
      }
      const saved: Pick<Published, "config" | "revision"> = await response.json()
      setPublished({ ...saved, products: selected })
      setTitle(saved.config.title)
      setNotice(saved.config.product_ids.length
        ? "Featured products published. The storefront will refresh its cached copy."
        : "The featured products row has been removed.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish featured products.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="flex flex-col gap-5 p-4 sm:p-6">
      <Link to="/oweg-homepage" className="text-sm text-ui-fg-interactive">Back to Homepage settings</Link>
      <div className="space-y-1">
        <Heading level="h1">Featured Products</Heading>
        <Text size="small" className="text-ui-fg-subtle">Choose the products shown below Flash Sale. They use their regular storefront prices.</Text>
      </div>
      {error && <p role="alert" className="text-sm text-ui-fg-error">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!published && !error && <p role="status">Loading featured products…</p>}
      {published && (
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="featured-title">Row title</Label>
            <Input id="featured-title" value={title} maxLength={80} onChange={event => { setTitle(event.target.value); setNotice("") }} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="min-w-0 space-y-3 rounded-lg border border-ui-border-base p-4">
              <Heading level="h2">Find published products</Heading>
              <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); findProducts({ term: query.trim(), cursor: null, previous: [] }) }}>
                <Input aria-label="Product search" placeholder="Search by product name" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 basis-40" />
                <Button type="submit" variant="secondary">Search</Button>
              </form>
              {searching && <p role="status">Searching…</p>}
              {searchError && (
                <div className="space-y-2">
                  <p role="alert" className="text-sm text-ui-fg-error">{searchError}</p>
                  <Button type="button" variant="secondary" onClick={() => findProducts({ ...search })}>Retry</Button>
                </div>
              )}
              {!searching && !searchError && (
                <>
                  {results.length === 0 && <Text size="small">No products found.</Text>}
                  <ul className="divide-y divide-ui-border-base">
                    {results.map(product => {
                      const added = selected.some(item => item.id === product.id)
                      return (
                        <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                          <ProductPreview product={product} />
                          <Button size="small" variant="secondary" disabled={added} onClick={() => edit([...selected, product])}>{added ? "Added" : "Add"}</Button>
                        </li>
                      )
                    })}
                  </ul>
                  <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Product results pages">
                    <Button type="button" size="small" variant="secondary" disabled={!search.previous.length}
                      onClick={() => findProducts({ ...search, cursor: search.previous.at(-1) ?? null, previous: search.previous.slice(0, -1) })}>Previous</Button>
                    <span className="text-sm text-ui-fg-subtle" aria-live="polite">Page {search.previous.length + 1}</span>
                    <Button type="button" size="small" variant="secondary" disabled={!nextCursor}
                      onClick={() => findProducts({ ...search, cursor: nextCursor, previous: [...search.previous, search.cursor] })}>Next</Button>
                  </nav>
                </>
              )}
            </section>
            <section className="min-w-0 space-y-3 rounded-lg border border-ui-border-base p-4">
              <Heading level="h2">Selected products · {selected.length}</Heading>
              {!selected.length && <Text size="small">Publish with no products to hide the row.</Text>}
              <ol className="divide-y divide-ui-border-base">
                {selected.map((product, index) => (
                  <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <ProductPreview product={product} />
                      {(product.status !== "published" || invalidIds.includes(product.id)) && <p className="text-ui-fg-error">Unavailable. Remove before publishing.</p>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="small" variant="secondary" aria-label={`Move ${product.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                      <Button size="small" variant="secondary" aria-label={`Move ${product.title} down`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}>↓</Button>
                      <Button size="small" variant="secondary" aria-label={`Remove ${product.title}`} onClick={() => edit(selected.filter(item => item.id !== product.id))}>Remove</Button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <Button type="button" disabled={saving || !title.trim()} onClick={() => void publish()}>{saving ? "Publishing…" : "Publish featured products"}</Button>
        </fieldset>
      )}
      {error && (
        <Button variant="secondary" disabled={saving} onClick={() => {
          setPublished(null)
          setError("")
          setReload(value => value + 1)
        }}>Reload saved selection</Button>
      )}
    </Container>
  )
}
