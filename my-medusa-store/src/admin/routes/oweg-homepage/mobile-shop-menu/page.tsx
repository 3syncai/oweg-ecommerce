"use client"

import { useEffect, useState } from "react"
import { Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { getAdminBackendUrl, readAdminApiError } from "../../../lib/admin-backend"
import { mobileMenuLimit, parseMobileMenu, type MobileMenuItem } from "../../../../shared/mobile-shop-menu"

const sections = ["Shop", "Support"] as const
type EditorItem = MobileMenuItem & { key: string }

export default function MobileShopMenuPage() {
  const [items, setItems] = useState<EditorItem[] | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const endpoint = getAdminBackendUrl() + "/admin/mobile-shop-menu"

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(endpoint, { credentials: "include", signal: controller.signal })
        if (!response.ok) throw new Error(await readAdminApiError(response, "Unable to load menu"))
        const menu = parseMobileMenu((await response.json()).items)
        if (!menu) throw new Error("The server returned invalid menu data.")
        if (!controller.signal.aborted) setItems(menu.map(item => ({ ...item, key: crypto.randomUUID() })))
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load menu.")
      }
    }
    void load()
    return () => controller.abort()
  }, [endpoint, reload])

  function edit(next: EditorItem[]) {
    setItems(next)
    setError("")
    setNotice("")
  }

  async function publish() {
    const menu = parseMobileMenu(items)
    if (!menu) {
      setError("Enter a label of up to 48 characters and a unique storefront path for every item.")
      return
    }
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: menu }),
      })
      if (!response.ok) throw new Error(await readAdminApiError(response, "Unable to publish menu"))
      setNotice("Menu published. Cached storefront copies may take a few minutes to refresh.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish menu.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="flex flex-col gap-5 p-6">
      <Link to="/oweg-homepage" className="text-ui-fg-interactive">Back to Homepage settings</Link>
      <Heading level="h1">Mobile Shopping Menu</Heading>
      <Text size="small">Add or remove links in each section, or hide a link to keep it for later. Changes go live when you publish.</Text>
      {error && <p role="alert" className="text-ui-fg-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {items === null ? (
        error ? <Button type="button" variant="secondary" onClick={() => { setError(""); setReload(value => value + 1) }}>Retry</Button> : <p role="status">Loading menu…</p>
      ) : (
        <form onSubmit={event => { event.preventDefault(); void publish() }}>
          <fieldset disabled={saving} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-5">
              {sections.map(section => {
                const rows = items.filter(item => item.section === section)
                return (
                  <section key={section} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Heading level="h2">{section}</Heading>
                      <Button type="button" variant="secondary" disabled={items.length >= mobileMenuLimit} onClick={() => edit([...items, { key: crypto.randomUUID(), label: "", href: "", section, visible: true }])}>Add item</Button>
                    </div>
                    {rows.map((item, position) => {
                      const index = items.indexOf(item)
                      const update = (patch: Partial<MobileMenuItem>) => edit(items.map(row => row.key === item.key ? { ...row, ...patch } : row))
                      const move = (step: number) => {
                        const other = items.indexOf(rows[position + step])
                        const next = [...items]
                        next[index] = items[other]
                        next[other] = item
                        edit(next)
                      }
                      return (
                        <div key={item.key} className="space-y-2 rounded-lg border p-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="space-y-1">Label<Input value={item.label} maxLength={48} onChange={event => update({ label: event.target.value })} /></label>
                            <label className="space-y-1">Storefront path<Input value={item.href} placeholder="/c/kitchen-appliances" maxLength={200} onChange={event => update({ href: event.target.value })} /></label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="mr-2 flex items-center gap-1"><input type="checkbox" checked={item.visible} onChange={event => update({ visible: event.target.checked })} /> Visible</label>
                            <Button type="button" size="small" variant="secondary" disabled={position === 0} onClick={() => move(-1)}>Move up</Button>
                            <Button type="button" size="small" variant="secondary" disabled={position === rows.length - 1} onClick={() => move(1)}>Move down</Button>
                            <Button type="button" size="small" variant="secondary" onClick={() => edit(items.filter(row => row.key !== item.key))}>Remove</Button>
                          </div>
                        </div>
                      )
                    })}
                  </section>
                )
              })}
              <Text size="small">Use existing destinations such as /brands, /flash-sale, /specials, category or brand pages, and support pages.</Text>
              <Button type="submit" isLoading={saving}>Publish menu</Button>
            </div>
            <aside className="h-fit rounded-lg border p-4" aria-label="Mobile menu preview">
              <Heading level="h2">Mobile preview</Heading>
              {sections.map(section => {
                const visible = items.filter(item => item.section === section && item.visible && item.label.trim())
                return visible.length > 0 && <div key={section} className="mt-4">
                  <Text weight="plus">{section}</Text>
                  <ul>{visible.map(item => <li key={item.key} className="break-words border-b py-2">{item.label}</li>)}</ul>
                </div>
              })}
              {!items.some(item => item.visible && item.label.trim()) && <Text size="small">No visible links</Text>}
            </aside>
          </fieldset>
        </form>
      )}
    </Container>
  )
}
