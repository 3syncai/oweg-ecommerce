import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

type Vendor = {
  id: string
  name: string
  email: string
  phone?: string | null
  store_name?: string | null
}

const VendorRequestsWidget = () => {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/admin/vendors/pending", { credentials: "include" })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setVendors(data?.vendors || [])
    } catch (e: any) {
      setError(e?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const approve = async (id: string) => {
    setError("")
    try {
      const res = await fetch(`/admin/vendors/${id}/approve`, { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
      await load()
    } catch (e: any) {
      setError(e?.message || "Approve failed")
    }
  }

  return (
    <div className="rounded-lg bg-ui-bg-subtle p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="inter-base-semibold">Vendor Requests</div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      {error ? <div className="text-red-600 inter-small-regular mb-2">{error}</div> : null}
      {loading ? <div className="inter-small-regular">Loading...</div> : (
        vendors.length === 0 ? (
          <div className="inter-small-regular text-ui-fg-subtle">No pending vendors.</div>
        ) : (
          <div className="space-y-2">
            {vendors.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <div className="flex-1 inter-small-regular">
                  <div className="inter-small-semibold">{v.store_name || v.name}</div>
                  <div className="text-ui-fg-subtle">{v.email}{v.phone ? ` · ${v.phone}` : ""}</div>
                </div>
                <button className="btn btn-primary btn-small" onClick={() => approve(v.id)}>Approve</button>
              </div>
            ))}
            {/* Link to the full admin page we created */}
            <a href="/app/vendor-requests" className="text-ui-fg-interactive inter-small-regular">Open Vendor Requests</a>
          </div>
        )
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: [],
})

export default VendorRequestsWidget


