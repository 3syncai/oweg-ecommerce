import { ADMIN_RESPONSIBILITIES } from "../../../shared/admin-responsibilities"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button, Input, Label, Badge } from "@medusajs/ui"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ADMIN_PERMISSION_GROUPS, type AdminAccess, type AdminPermission, type CustomAdminPermission } from "../../../shared/admin-access"
import { accessRequest, currentAdminAccess } from "../../lib/admin-access-client"
import { roleCompatibilityError, supportedRolePermissions, type AdminRoleCatalog } from "../../../shared/admin-role-catalog"
import { Link } from "react-router-dom"

type Role = { id: string; name: string; responsibilities: string; permissions: AdminPermission[] }
type Account = AdminAccess & { email: string; first_name: string | null; last_name: string | null }
type AuditEvent = { id: string; actor_email: string; action: string; target_id: string; created_at: string }
type Credentials = { email: string; password: string; email_status?: "sent" | "failed" }
const blankRole = { id: "", name: "", responsibilities: "", permissions: [] as AdminPermission[] }
const blankUser = { email: "", first_name: "", last_name: "", password: "", role_id: "" }

function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-ui-bg-base p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4"><Heading level="h2">{title}</Heading><Button variant="transparent" size="small" onClick={close}>Close</Button></div>
      {children}
    </section>
  </div>
}

export default function AdminAccessPage() {
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [customPermissions, setCustomPermissions] = useState<CustomAdminPermission[]>([])
  const [roleCatalog, setRoleCatalog] = useState<AdminRoleCatalog | undefined>(undefined)
  const [tab, setTab] = useState<"accounts" | "roles" | "activity">("accounts")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [creating, setCreating] = useState(false)
  const [userDraft, setUserDraft] = useState(blankUser)
  const [roleDraft, setRoleDraft] = useState<Role | null>(null)
  const [editing, setEditing] = useState<Account | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)

  const reload = async () => {
    const [usersData, rolesData, auditData, permissionsData] = await Promise.all([accessRequest("/users"), accessRequest("/roles"), accessRequest("/audit"), accessRequest("/permissions")])
    setAccounts(usersData.users); setRoles(rolesData.roles); setEvents(auditData.events)
    setCustomPermissions(permissionsData.permissions)
    setRoleCatalog(rolesData.role_catalog)
  }
  useEffect(() => {
    currentAdminAccess().then(async value => { setAccess(value); if (value.kind === "superadmin" && value.active) await reload() })
      .catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("")
    try { await work(); await reload() } catch (e: any) { setError(e.message || "The change could not be saved") } finally { setBusy(false) }
  }
  const createUser = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const data = await accessRequest("/users", { ...userDraft, password: userDraft.password || undefined })
      setCredentials(data.credentials); setUserDraft(blankUser); setCreating(false)
    })
  }
  const saveAssignment = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    void run(async () => {
      await accessRequest(`/users/${encodeURIComponent(editing.user_id)}`, { role_id: editing.role_id, active: editing.active })
      setEditing(null); setNotice("Subadmin access updated. The new permissions apply to subsequent requests.")
    })
  }
  const saveRole = (event: FormEvent) => {
    event.preventDefault()
    if (!roleDraft) return
    const incompatible = roleCompatibilityError(roleDraft.permissions, supportedPermissions)
    if (incompatible) { setError(incompatible); return }
    void run(async () => {
      const { id, ...body } = roleDraft
      await accessRequest(id ? `/roles/${encodeURIComponent(id)}` : "/roles", body)
      setRoleDraft(null); setNotice("Role saved. All subadmins assigned to it receive these permissions.")
    })
  }

  const supportedPermissions = supportedRolePermissions(roleCatalog, customPermissions.map(permission => permission.id))
  const permissionOptions = [
    ...ADMIN_PERMISSION_GROUPS.map(group => ({ id: group.id as AdminPermission, label: group.label, description: group.description })),
    ...ADMIN_RESPONSIBILITIES.map(item => ({ id: item.id as AdminPermission, label: item.label, description: "Specific responsibility" })),
    ...customPermissions.map(permission => ({ id: permission.id, label: `${permission.name}${permission.enabled ? "" : " (disabled)"}`, description: permission.description })),
  ]

  if (loading) return <Container><Text>Loading admin access…</Text></Container>
  if (!access?.active || access.kind !== "superadmin") return <Container><Heading>Superadmin access required</Heading><Text className="mt-3">Only the superadmin can manage Medusa admin accounts and permissions.</Text>{error && <Text>{error}</Text>}</Container>

  return <Container className="p-0">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ui-border-base p-6">
      <div><Heading level="h1">Admin Access</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">Create subadmins and decide which areas each role can manage.</Text></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setError(""); setRoleDraft({ ...blankRole }) }}>Create role</Button><Button disabled={busy || !roles.length} onClick={() => { setError(""); setUserDraft({ ...blankUser, role_id: roles[0]?.id || "" }); setCreating(true) }}>Create subadmin</Button></div>
    </div>
    <div className="px-6 pt-5"><Badge color="green">One superadmin · {accounts.find(a => a.kind === "superadmin")?.email}</Badge><Text size="small" className="mt-2 text-ui-fg-muted">The superadmin is managed through the CLI. Subadmins cannot grant permissions or create other Medusa admins.</Text></div>
    <div className="flex flex-wrap gap-2 border-b border-ui-border-base px-6 py-4">{(["accounts", "roles", "activity"] as const).map(value => <Button key={value} variant={tab === value ? "primary" : "secondary"} size="small" onClick={() => setTab(value)}>{value === "accounts" ? "Admin accounts" : value === "roles" ? "Roles & responsibilities" : "Activity"}</Button>)}</div>
    {error && <div role="alert" className="mx-6 mt-4 rounded-lg border border-ui-border-error p-3 text-ui-fg-error">{error}</div>}
    {notice && <div role="status" className="mx-6 mt-4 rounded-lg border border-ui-border-base p-3">{notice}</div>}
    <div className="overflow-x-auto p-6">
      {tab === "activity" && <Link to="/activity-log" className="mb-4 inline-block text-sm underline">Open the full Activity Log with actions, sign-ins and IP locations</Link>}
      {tab === "accounts" && <>
        <Text size="small" className="mb-4 text-ui-fg-subtle">Existing accounts marked “Unassigned” have no business access until you assign a role.</Text>
        <table className="w-full text-left text-sm"><thead className="text-ui-fg-subtle"><tr>{["Admin", "Role", "Status", "Actions"].map(label => <th key={label} className="border-b border-ui-border-base p-3 font-medium">{label}</th>)}</tr></thead><tbody>
          {accounts.map(account => <tr key={account.user_id} className="border-b border-ui-border-base">
            <td className="p-3"><div className="font-medium">{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.email}</div><div className="text-ui-fg-subtle">{account.email}</div></td>
            <td className="p-3">{account.kind === "superadmin" ? "Superadmin · full access" : account.role_name || "Unassigned"}</td>
            <td className="p-3"><Badge color={account.active ? "green" : "grey"}>{account.active ? "Active" : account.kind === "unassigned" ? "Unassigned" : "Disabled"}</Badge>{account.must_change_password && <Text size="small" className="mt-1 text-ui-fg-subtle">Password change required</Text>}</td>
            <td className="p-3">{account.kind === "superadmin" ? <Text size="small" className="text-ui-fg-muted">CLI managed</Text> : <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="small" disabled={busy} onClick={() => { setError(""); setEditing({ ...account, role_id: account.role_id || roles[0]?.id || "", active: account.kind === "unassigned" ? true : account.active }) }}>{account.kind === "unassigned" ? "Assign access" : "Edit access"}</Button>
              {account.kind === "subadmin" && <Button variant="secondary" size="small" disabled={busy} onClick={() => void run(async () => {
                const data = await accessRequest(`/users/${encodeURIComponent(account.user_id)}/credentials`, {})
                setCredentials(data.credentials)
              })}>Reset credentials</Button>}
            </div>}</td>
          </tr>)}
        </tbody></table>
      </>}
      {tab === "roles" && <div className="grid gap-4 sm:grid-cols-2">{roles.map(role => <div key={role.id} className="rounded-lg border border-ui-border-base p-4">
        <div className="flex items-center justify-between gap-3"><Heading level="h2">{role.name}</Heading><Button size="small" variant="secondary" disabled={busy} onClick={() => { setError(""); setRoleDraft({ ...role, permissions: [...role.permissions] }) }}>Edit role</Button></div>
        <Text size="small" className="mt-2 text-ui-fg-subtle">{role.responsibilities || "No responsibilities entered."}</Text>
        <div className="mt-3 flex flex-wrap gap-2">{role.permissions.map(permission => <Badge key={permission}>{permissionOptions.find(g => g.id === permission)?.label || permission}</Badge>)}{!role.permissions.length && <Badge>No business access</Badge>}</div>
        <Text size="small" className="mt-3 text-ui-fg-muted">{accounts.filter(a => a.role_id === role.id).length} assigned admin(s)</Text>
      </div>)}</div>}
      {tab === "activity" && <><Text size="small" className="mb-4 text-ui-fg-subtle">Most recent 100 access changes. Passwords are never recorded here.</Text><table className="w-full text-left text-sm"><thead><tr>{["When", "Changed by", "Action", "Account / role"].map(label => <th className="border-b border-ui-border-base p-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{events.map(event => <tr className="border-b border-ui-border-base" key={event.id}><td className="p-3">{new Date(event.created_at).toLocaleString()}</td><td className="p-3">{event.actor_email || "CLI"}</td><td className="p-3">{event.action}</td><td className="p-3">{accounts.find(a => a.user_id === event.target_id)?.email || roles.find(r => r.id === event.target_id)?.name || event.target_id}</td></tr>)}</tbody></table></>}
    </div>



    {creating && <Dialog title="Create subadmin" close={() => { if (!busy) { setCreating(false); setUserDraft(blankUser) } }}><form className="flex flex-col gap-4" onSubmit={createUser}>
      {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="admin-first-name">First name</Label><Input id="admin-first-name" value={userDraft.first_name} onChange={e => setUserDraft({ ...userDraft, first_name: e.target.value })} maxLength={100} /></div><div><Label htmlFor="admin-last-name">Last name</Label><Input id="admin-last-name" value={userDraft.last_name} onChange={e => setUserDraft({ ...userDraft, last_name: e.target.value })} maxLength={100} /></div></div>
      <div><Label htmlFor="admin-email">Login email</Label><Input id="admin-email" type="email" required autoComplete="off" maxLength={254} value={userDraft.email} onChange={e => setUserDraft({ ...userDraft, email: e.target.value })} /></div>
      <div><Label htmlFor="admin-role">Role</Label><select id="admin-role" required className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2" value={userDraft.role_id} onChange={e => setUserDraft({ ...userDraft, role_id: e.target.value })}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Text size="small" className="mt-2 text-ui-fg-subtle">{roles.find(r => r.id === userDraft.role_id)?.responsibilities}</Text></div>
      <div><Label htmlFor="admin-password">Password (optional)</Label><Input id="admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={userDraft.password} onChange={e => setUserDraft({ ...userDraft, password: e.target.value })} placeholder="Leave blank to generate a strong password" /><Text size="small" className="mt-2 text-ui-fg-muted">A welcome email includes the admin site, creation date and temporary credentials. The subadmin must choose a new password at first sign-in.</Text></div>
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create subadmin"}</Button>
    </form></Dialog>}

    {editing && <Dialog title={`Access for ${editing.email}`} close={() => { if (!busy) setEditing(null) }}><form className="flex flex-col gap-4" onSubmit={saveAssignment}>
      {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
      <Label htmlFor="assigned-role">Assigned role</Label><select id="assigned-role" required className="w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2" value={editing.role_id || ""} onChange={e => setEditing({ ...editing, role_id: e.target.value })}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
      <Text size="small" className="text-ui-fg-subtle">{roles.find(r => r.id === editing.role_id)?.responsibilities}</Text>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />Access enabled</label>
      <Text size="small" className="text-ui-fg-muted">Disabling access blocks business requests from existing sessions immediately.</Text><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save access"}</Button>
    </form></Dialog>}

    {roleDraft && <Dialog title={roleDraft.id ? "Edit role" : "Create role"} close={() => { if (!busy) setRoleDraft(null) }}><form className="flex flex-col gap-4" onSubmit={saveRole}>
      {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
      {!roleCatalog && <Text role="status" size="small" className="text-ui-fg-error">This backend needs an update and restart before individual responsibilities can be selected. Deploy Medusa and the admin app from the same revision, then refresh.</Text>}
      <div><Label htmlFor="role-name">Role name</Label><Input id="role-name" required maxLength={100} value={roleDraft.name} onChange={e => setRoleDraft({ ...roleDraft, name: e.target.value })} /></div>
      <div><Label htmlFor="role-responsibilities">Responsibilities</Label><textarea id="role-responsibilities" maxLength={2000} className="mt-1 min-h-20 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-sm" value={roleDraft.responsibilities} onChange={e => setRoleDraft({ ...roleDraft, responsibilities: e.target.value })} /></div>
      <fieldset><legend className="mb-3 text-sm font-medium">Permissions</legend><div className="flex flex-col gap-3">{ADMIN_PERMISSION_GROUPS.map(group => {
        const children = ADMIN_RESPONSIBILITIES.filter(item => item.group === group.id)
        const full = roleDraft.permissions.includes(group.id)
        return <div key={group.id} className="rounded-lg border border-ui-border-base p-4">
          <label className="flex items-start gap-3"><input type="checkbox" checked={full || children.every(item => roleDraft.permissions.includes(item.id))} onChange={e => setRoleDraft({ ...roleDraft, permissions: [...roleDraft.permissions.filter(p => p !== group.id && !children.some(item => item.id === p)), ...(e.target.checked ? [group.id] : [])] })} /><span><span className="text-sm font-medium">{group.label} — all responsibilities</span><span className="mt-1 block text-xs text-ui-fg-subtle">{group.description}</span></span></label>
          <div className="ml-7 mt-3 grid gap-3 sm:grid-cols-2">{children.map(item => <label className="flex items-center gap-2 text-sm" key={item.id}><input type="checkbox" disabled={!supportedPermissions.includes(item.id)} checked={full || roleDraft.permissions.includes(item.id)} onChange={e => {
            const selected = full ? [...roleDraft.permissions.filter(p => p !== group.id), ...children.map(child => child.id)] : roleDraft.permissions
            setRoleDraft({ ...roleDraft, permissions: e.target.checked ? [...new Set([...selected, item.id])] : selected.filter(p => p !== item.id) })
          }} />{item.label}</label>)}</div>
        </div>
      })}
      {customPermissions.map(permission => <label key={permission.id} className="flex items-center gap-3 rounded-lg border border-ui-border-base p-3"><input type="checkbox" checked={roleDraft.permissions.includes(permission.id)} onChange={e => setRoleDraft({ ...roleDraft, permissions: e.target.checked ? [...roleDraft.permissions, permission.id] : roleDraft.permissions.filter(p => p !== permission.id) })} />{permission.name}{!permission.enabled && " (disabled)"}</label>)}</div></fieldset>
      <Text size="small" className="text-ui-fg-muted">Saving a role changes access for every subadmin assigned to it. Only the superadmin can create roles and subadmins.</Text><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save role"}</Button>
    </form></Dialog>}

    {credentials && <Dialog title="Subadmin credentials" close={() => setCredentials(null)}><div className="flex flex-col gap-4">
      {credentials.email_status === "sent" && <Text role="status" className="text-ui-fg-success">Credential email sent with the admin site and temporary credentials.</Text>}
      {credentials.email_status === "failed" && <Text role="alert" className="text-ui-fg-error">Credentials are ready, but email delivery failed. Copy these credentials securely. After fixing SMTP, use Reset credentials to email a new temporary password; do not create the account again.</Text>}
      <Text size="small">The subadmin must change this password at sign-in. Copy these credentials now. The password will not be shown again after closing this dialog.</Text>
      <div><Label htmlFor="credential-email">Email</Label><Input id="credential-email" readOnly value={credentials.email} /></div><div><Label htmlFor="credential-password">Password</Label><Input id="credential-password" readOnly value={credentials.password} autoComplete="off" /></div>
      <Button onClick={async () => { try { await navigator.clipboard.writeText(`Admin: ${window.location.origin}/app\nEmail: ${credentials.email}\nPassword: ${credentials.password}`); setNotice("Credentials copied.") } catch { setError("Clipboard unavailable. Copy the credentials from the fields above.") } }}>Copy credentials</Button>
      <Button variant="secondary" onClick={() => setCredentials(null)}>I have saved the credentials</Button>
    </div></Dialog>}
  </Container>
}
export const config = defineRouteConfig({ label: "Admin Access" })
