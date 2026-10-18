type Collection = { id: string; title: string; handle?: string }
const normalizedTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase()

/** Brand requests from several products must converge on one collection. */
export async function resolveRequestedCollection(backend: string, requestedTitle: string, request: typeof fetch = fetch): Promise<{ collection: Collection; created: boolean }> {
  const title = requestedTitle.trim().replace(/\s+/g, " ")
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  if (!title || !handle) throw new Error("Enter a valid brand name")
  const endpoint = `${backend.replace(/\/$/, "")}/admin/collections`
  const errorMessage = async (response: Response) => {
    const data = await response.json().catch(() => null)
    return data?.message || `Brand request failed (HTTP ${response.status})`
  }
  const find = async (): Promise<Collection | undefined> => {
    for (const query of [`handle=${encodeURIComponent(handle)}`, `q=${encodeURIComponent(title)}&limit=100`]) {
      const response = await request(`${endpoint}?${query}`, { credentials: "include", cache: "no-store" })
      if (!response.ok) throw new Error(await errorMessage(response))
      const data = await response.json()
      const matches = (data.collections || []).filter((collection: Collection) => normalizedTitle(collection.title) === normalizedTitle(title))
      if (matches.length > 1) throw new Error("Multiple brands have this name. Select the correct brand before resolving this request.")
      if (matches[0]) return matches[0]
      if (query.startsWith("handle=") && data.collections?.length) throw new Error("This brand handle belongs to a different collection. Review the brand before assigning it.")
    }
    return undefined
  }
  const existing = await find()
  if (existing) return { collection: existing, created: false }
  const response = await request(endpoint, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, handle }) })
  if (!response.ok) {
    const message = await errorMessage(response)
    // A concurrent review may have created the same brand after our lookup.
    if (response.status === 400 || response.status === 409) {
      const concurrent = await find()
      if (concurrent) return { collection: concurrent, created: false }
    }
    throw new Error(message)
  }
  const data = await response.json()
  if (!data.collection?.id) throw new Error("No brand ID returned")
  return { collection: data.collection, created: true }
}
