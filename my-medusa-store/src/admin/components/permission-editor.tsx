import { useState, type FormEvent } from "react"
import { Button, Input, Label, Text } from "@medusajs/ui"
import { normalizeAdminPath, type CustomAdminPermission } from "../../shared/admin-access"

export function PermissionEditor({ permission, busy, error, save }: {
  permission: CustomAdminPermission | null
  busy: boolean
  error: string
  save: (input: Omit<CustomAdminPermission, "id">) => void
}) {
  const [name, setName] = useState(permission?.name || "")
  const [description, setDescription] = useState(permission?.description || "")
  const [pages, setPages] = useState(permission?.page_paths.join("\n") || "")
  const [apis, setApis] = useState(permission?.api_paths.join("\n") || "")
  const [mode, setMode] = useState<"view" | "manage">(permission?.access_mode || "view")
  const [enabled, setEnabled] = useState(permission?.enabled ?? true)
  const paths = (value: string) => [...new Set(value.split(/[\n,]/).map(p => p.trim().replace(/\/+$/, "")).filter(Boolean))]
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save({ name, description, page_paths: paths(pages).map(normalizeAdminPath), api_paths: paths(apis), access_mode: mode, enabled })
  }
  return <form className="flex flex-col gap-4" onSubmit={submit}>
    {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
    <Text size="small" className="text-ui-fg-subtle">Connect a permission to an existing admin section. Once saved, it becomes an option when creating or editing a role.</Text>
    <div><Label htmlFor="permission-name">Permission name</Label><Input id="permission-name" required maxLength={100} placeholder="For example: Customer groups only" value={name} onChange={e => setName(e.target.value)} /></div>
    <div><Label htmlFor="permission-description">Responsibility</Label><Input id="permission-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this permission allows the admin to do" /></div>
    <div><Label htmlFor="permission-pages">Admin page paths</Label><textarea id="permission-pages" required rows={2} className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-sm" placeholder="/customer-groups" value={pages} onChange={e => setPages(e.target.value)} /><Text size="small" className="mt-1 text-ui-fg-muted">Use the part of the admin URL after /app. Enter one section per line. Subpages are included.</Text></div>
    <div><Label htmlFor="permission-apis">Backend API paths</Label><textarea id="permission-apis" required rows={2} className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-sm" placeholder="/admin/customer-groups" value={apis} onChange={e => setApis(e.target.value)} /><Text size="small" className="mt-1 text-ui-fg-muted">Enter the API sections this feature uses, one per line. For customer groups, use /admin/customer-groups. Creating a permission does not create a new page or feature.</Text></div>
    <div><Label htmlFor="permission-actions">Allowed actions</Label><select id="permission-actions" className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2" value={mode} onChange={e => setMode(e.target.value as "view" | "manage")}><option value="view">View only</option><option value="manage">View, create, edit and delete</option></select></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Permission enabled</label>
    <Text size="small" className="text-ui-fg-muted">Changes apply to every role using this permission. Admin account management and permission assignment stay exclusive to the superadmin.</Text>
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save permission"}</Button>
  </form>
}
