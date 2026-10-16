import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ADMIN_PERMISSION_GROUPS, type AdminAccess } from "../../../shared/admin-access"
import { currentAdminAccess } from "../../lib/admin-access-client"

export default function MyAccessPage() {
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { currentAdminAccess().then(setAccess).catch(e => setError(e.message)) }, [])
  return <Container className="p-6">
    <Heading level="h1">My access</Heading>
    {error && <Text className="mt-3 text-ui-fg-error">{error}</Text>}
    {!access && !error && <Text className="mt-3">Loading your access…</Text>}
    {access && <>
      <div className="mt-3"><Badge>{access.kind === "superadmin" ? "Superadmin" : access.role_name || "Access not assigned"}</Badge></div>
      <Text className="mt-3 text-ui-fg-subtle">{access.active ? access.responsibilities || (access.kind === "superadmin" ? "Full access to all admin areas and access management." : "You can access the sections assigned to your role below. Contact the superadmin for changes.") : "Your access is not active. Contact the superadmin to assign a role or restore access."}</Text>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {access.active && ADMIN_PERMISSION_GROUPS.filter(g => access.permissions.includes(g.id)).map(group => <Link key={group.id} to={group.paths[0]} className="rounded-lg border border-ui-border-base p-4 hover:bg-ui-bg-subtle-hover">
          <Heading level="h2">{group.label}</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">{group.description}</Text>
        </Link>)}
        {access.active && access.custom_permissions?.filter(permission => permission.enabled && access.permissions.includes(permission.id)).map(permission => <Link key={permission.id} to={permission.page_paths[0]} className="rounded-lg border border-ui-border-base p-4 hover:bg-ui-bg-subtle-hover">
          <Heading level="h2">{permission.name}</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">{permission.description}</Text><Badge>{permission.access_mode === "view" ? "View only" : "Full management"}</Badge>
        </Link>)}
        {access.active && access.kind === "superadmin" && <Link to="/admin-access" className="rounded-lg border border-ui-border-base p-4 hover:bg-ui-bg-subtle-hover"><Heading level="h2">Admin Access</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">Create subadmins, manage roles and generate credentials.</Text></Link>}
        {access.active && access.kind === "superadmin" && <Link to="/activity-log" className="rounded-lg border border-ui-border-base p-4 hover:bg-ui-bg-subtle-hover"><Heading level="h2">Activity Log</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">Review admin actions, sign-ins, IP locations and denied attempts.</Text></Link>}
      </div>
    </>}
  </Container>
}
export const config = defineRouteConfig({ label: "My Access" })
