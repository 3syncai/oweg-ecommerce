import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button, toast } from "@medusajs/ui"

function ShareProduct({ product }: { product: any }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState("")
  const share = async () => {
    let url = link
    setBusy(true)
    try {
      if (!url) {
        const response = await fetch(`/admin/products/${product.id}/share`, { method: "POST", credentials: "include" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || "Could not create share link")
        if (typeof data.url !== "string") throw new Error("Could not create share link")
        url = data.url
        setLink(url)
      }
      await navigator.clipboard.writeText(url)
      toast.success("Link copied", { description: "Send it to the vendor. The link expires in seven days." })
    } catch (error: any) {
      toast.error(url ? "Clipboard unavailable. Copy the link from the field below." : error.message || "Could not create share link")
    } finally { setBusy(false) }
  }
  return <div className="flex flex-col gap-1 py-2" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
    <Button size="small" variant="secondary" disabled={busy} onClick={e => { e.preventDefault(); e.stopPropagation(); void share() }}>{busy ? "Preparing…" : link ? "Copy link" : "Share"}</Button>
    {link && <input aria-label={`Share link for ${product.title}`} className="w-48 rounded border p-1 text-xs" readOnly value={link} onClick={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.select() }} onFocus={e => e.target.select()} />}
  </div>
}

export function useOwegProductListColumns(native: any[], products: any[] = []) {
  const ids = products.map(p => p.id).sort().join(",")
  const { data, isError } = useQuery<{ products: { id: string; skus: string[] }[] }>({
    queryKey: ["oweg-product-skus", ids], enabled: !!ids,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/admin/products/catalog-skus?${new URLSearchParams({ ids })}`, { credentials: "include", signal })
      if (!response.ok) throw new Error("Could not load product SKUs")
      return response.json()
    },
  })
  return useMemo(() => {
    const byId = new Map(data?.products.map(p => [p.id, p.skus]))
    const sku = { id: "oweg_sku", header: () => "SKU", cell: ({ row }: any) => <span className="whitespace-normal">{byId.get(row.original.id)?.join(", ") || (data ? "—" : isError ? "Unavailable" : "Loading…")}</span> }
    const share = { id: "oweg_share", header: () => "Share", cell: ({ row }: any) => <ShareProduct product={row.original} /> }
    return [...native.slice(0, 1), sku, ...native.slice(1), share]
  }, [native, data, isError])
}
