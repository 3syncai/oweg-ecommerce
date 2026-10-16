import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ClockSolid } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Text,
} from "@medusajs/ui"
import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  accessRequest,
  currentAdminAccess,
} from "../../lib/admin-access-client"
import {
  activityArea,
  activityDescription,
} from "../../../shared/admin-activity-display"

type Location = {
  source: string
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
  timezone?: string
  accuracy_km?: number
}
type Event = {
  id: string
  actor_id: string
  actor_email: string | null
  actor_name: string | null
  actor_role: string | null
  actor_kind: string | null
  action: string
  category: string
  path: string | null
  method: string | null
  target_id: string
  created_at: string
  status_code: number | null
  duration_ms: number | null
  ip_address: string | null
  user_agent: string | null
  location: Location
  request_id: string | null
  details: Record<string, unknown>
  repeat_count: number
  first_occurred_at: string
}
type Result = {
  events: Event[]
  count: number
  admins: number
  denied: number
  failed: number
}
type Actor = { user_id: string; email: string; kind: string }
const blankFilters = {
  actor_id: "",
  category: "all",
  result: "all",
  q: "",
  from: "",
  to: "",
}
const selectClass =
  "h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm text-ui-fg-base"
const eventLabel = activityDescription
const locationLabel = (location?: Location) =>
  location?.source === "local"
    ? "Local/private network"
    : location?.source === "offline_ip"
      ? [location.city, location.region, location.country]
          .filter(Boolean)
          .join(", ") || "Approximate IP location"
      : "Location unavailable"
function Outcome({
  status,
  technical = false,
}: {
  status: number | null
  technical?: boolean
}) {
  const denied = status === 401 || status === 403
  return (
    <Badge
      color={denied ? "orange" : status && status >= 400 ? "red" : "green"}
    >
      {denied
        ? "Denied"
        : status && status >= 400
          ? "Failed"
          : status
            ? "Success"
            : "Recorded"}
      {technical && status ? ` · ${status}` : ""}
    </Badge>
  )
}

export default function ActivityLogPage() {
  const [authorized, setAuthorized] = useState(false)
  const [view, setView] = useState<"activity" | "technical">("activity")
  const [actors, setActors] = useState<Actor[]>([])
  const [draft, setDraft] = useState(blankFilters)
  const [filters, setFilters] = useState(blankFilters)
  const [offset, setOffset] = useState(0)
  const [snapshot, setSnapshot] = useState(() => new Date().toISOString())
  const [data, setData] = useState<Result>({
    events: [],
    count: 0,
    admins: 0,
    denied: 0,
    failed: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Event | null>(null)
  const selectedRef = useRef(selected)
  const pageSnapshot = useRef(snapshot)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  const limit = 25
  useEffect(() => {
    let active = true
    void currentAdminAccess()
      .then(async (access) => {
        if (!access.active || access.kind !== "superadmin")
          throw new Error("Only the superadmin can view admin activity.")
        const accounts = await accessRequest("/users")
        if (active) {
          setActors(accounts.users)
          setAuthorized(true)
        }
      })
      .catch((error) => {
        if (active) {
          setError(error.message)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!authorized) return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    setSelected(null)
    let inFlight = false
    const load = async (background = false) => {
      if (inFlight || controller.signal.aborted) return
      inFlight = true
      const before = offset === 0 ? new Date().toISOString() : pageSnapshot.current
      const query = new URLSearchParams({
        view,
        limit: String(limit),
        offset: String(offset),
        before,
        category: filters.category,
        result: filters.result,
      })
      if (filters.actor_id) query.set("actor_id", filters.actor_id)
      if (filters.q) query.set("q", filters.q)
      if (filters.from)
        query.set("from", new Date(`${filters.from}T00:00:00`).toISOString())
      if (filters.to) {
        const end = new Date(`${filters.to}T00:00:00`)
        end.setDate(end.getDate() + 1)
        query.set("to", end.toISOString())
      }
      await fetch(`/admin/access/activity?${query}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json()
          if (!response.ok)
            throw new Error(body.message || "Unable to load activity")
          if (!controller.signal.aborted) {
            if (offset === 0) pageSnapshot.current = before
            setData(body)
            setError("")
            setUpdatedAt(new Date().toISOString())
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setError(background ? "Automatic update failed. Retrying shortly, or use Refresh activity." : error.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
          inFlight = false
        })
    }
    void load()
    const update = () => {
      if (offset === 0 && document.visibilityState === "visible" && !selectedRef.current)
        void load(true)
    }
    const timer = window.setInterval(update, 10000)
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", update)
    }
  }, [authorized, view, filters, offset, snapshot])
  const refresh = () => {
    setOffset(0)
    setSnapshot(new Date().toISOString())
  }
  const changeView = (value: "activity" | "technical") => {
    setView(value)
    setDraft({ ...draft, category: "all" })
    setFilters({ ...filters, category: "all" })
    refresh()
  }
  const activeFilters = Object.values(filters).filter(
    (value) => value && value !== "all"
  ).length
  const apply = (event: FormEvent) => {
    event.preventDefault()
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("Choose an end date on or after the start date.")
      return
    }
    setFilters({ ...draft, q: draft.q.trim() })
    refresh()
  }

  return (
    <>
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ui-border-base p-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Heading level="h1">Activity Log</Heading>
              <Badge>Superadmin only</Badge>
            </div>
            <Text className="mt-2 text-ui-fg-subtle">
              Follow admin sign-ins, page visits and changes.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Text size="small" className="text-ui-fg-subtle" role="status">
              {offset > 0 ? "Live updates paused on older pages" : "Auto-updates every 10 seconds"}
              {updatedAt && ` · Updated ${new Date(updatedAt).toLocaleTimeString()}`}
            </Text>
            <Button
              variant="secondary"
              disabled={!authorized || loading}
              onClick={refresh}
            >
              Refresh activity
            </Button>
          </div>
        </div>
        <div className="p-6">
          <div
            role="tablist"
            aria-label="Activity view"
            className="flex flex-wrap gap-2"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return
              event.preventDefault()
              const next =
                event.key === "Home"
                  ? "activity"
                  : event.key === "End"
                    ? "technical"
                    : view === "activity"
                      ? "technical"
                      : "activity"
              changeView(next)
              event.currentTarget
                .querySelectorAll<HTMLButtonElement>("button")
                [next === "activity" ? 0 : 1]?.focus()
            }}
          >
            <Button
              role="tab"
              tabIndex={view === "activity" ? 0 : -1}
              aria-selected={view === "activity"}
              variant={view === "activity" ? "secondary" : "transparent"}
              disabled={!authorized}
              onClick={() => changeView("activity")}
            >
              Admin Activity
            </Button>
            <Button
              role="tab"
              tabIndex={view === "technical" ? 0 : -1}
              aria-selected={view === "technical"}
              variant={view === "technical" ? "secondary" : "transparent"}
              disabled={!authorized}
              onClick={() => changeView("technical")}
            >
              Technical Requests
            </Button>
          </div>
          <Text size="small" className="mt-3 mb-5 text-ui-fg-subtle">
            {view === "activity"
              ? "Sign-ins, page visits and submitted changes. Repeated visits within 60 seconds are grouped; background requests remain in Technical Requests."
              : "Complete audit trail, including automatic reads, polling, calculations and individual page reports. These requests do not always represent an admin click."}
          </Text>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Admins", data.admins],
              ["Denied attempts", data.denied],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-ui-border-base p-4"
              >
                <Text size="small" className="text-ui-fg-subtle">
                  {label}
                </Text>
                <Text className="mt-1 text-2xl font-semibold">
                  {Number(value).toLocaleString()}
                </Text>
              </div>
            ))}
          </div>
          <details className="mt-5 rounded-lg border border-ui-border-base p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Filters{activeFilters ? ` (${activeFilters} active)` : ""}
            </summary>
            <form onSubmit={apply} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label htmlFor="activity-admin">Admin</Label>
                  <select
                    id="activity-admin"
                    className={selectClass}
                    value={draft.actor_id}
                    onChange={(event) =>
                      setDraft({ ...draft, actor_id: event.target.value })
                    }
                  >
                    <option value="">All admins</option>
                    {actors.map((actor) => (
                      <option key={actor.user_id} value={actor.user_id}>
                        {actor.email}
                        {actor.kind === "superadmin" ? " (superadmin)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="activity-category">Activity type</Label>
                  <select
                    id="activity-category"
                    className={selectClass}
                    value={draft.category}
                    onChange={(event) =>
                      setDraft({ ...draft, category: event.target.value })
                    }
                  >
                    {[
                      ["all", "All activity"],
                      [
                        "authentication",
                        view === "activity"
                          ? "Sign-ins & sign-outs"
                          : "Sign-ins & sessions",
                      ],
                      ["navigation", "Page visits"],
                      ...(view === "technical"
                        ? [["api", "API requests"]]
                        : []),
                      ["access_change", "Accounts & permissions"],
                      ["changes", "Changes & submitted actions"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="activity-result">Result</Label>
                  <select
                    id="activity-result"
                    className={selectClass}
                    value={draft.result}
                    onChange={(event) =>
                      setDraft({ ...draft, result: event.target.value })
                    }
                  >
                    {["all", "success", "denied", "failed"].map((value) => (
                      <option key={value} value={value}>
                        {value === "all"
                          ? "All results"
                          : value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="activity-from">From date</Label>
                  <Input
                    id="activity-from"
                    type="date"
                    value={draft.from}
                    onChange={(event) =>
                      setDraft({ ...draft, from: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="activity-to">To date</Label>
                  <Input
                    id="activity-to"
                    type="date"
                    value={draft.to}
                    onChange={(event) =>
                      setDraft({ ...draft, to: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="activity-search">Search history</Label>
                  <Input
                    id="activity-search"
                    maxLength={100}
                    placeholder="Admin email, section, IP or city"
                    value={draft.q}
                    onChange={(event) =>
                      setDraft({ ...draft, q: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!authorized || loading}>
                  Apply filters
                </Button>
                <Button
                  type="button"
                  variant="transparent"
                  disabled={!authorized || loading}
                  onClick={() => {
                    setDraft(blankFilters)
                    setFilters(blankFilters)
                    refresh()
                  }}
                >
                  Clear filters
                </Button>
                <Text size="small" className="text-ui-fg-muted">
                  IP locations are approximate. Private and localhost addresses
                  have no public location.
                </Text>
              </div>
            </form>
          </details>
          {error && (
            <Text
              role="alert"
              className="mt-4 rounded-lg border border-ui-border-error p-3 text-ui-fg-error"
            >
              {error}
            </Text>
          )}
        </div>
        <div
          className="overflow-x-auto border-t border-ui-border-base"
          aria-busy={loading}
        >
          <table
            aria-label={
              view === "activity"
                ? "Admin activity history"
                : "Technical request history"
            }
            className={`w-full text-left text-sm ${view === "technical" ? "min-w-[1000px]" : "min-w-[680px]"}`}
          >
            <thead className="bg-ui-bg-subtle">
              <tr>
                {[
                  "Time",
                  "Admin",
                  "Activity",
                  ...(view === "technical" ? ["Location / IP"] : []),
                  "Result",
                  "Details",
                ].map((label) => (
                  <th key={label} className="px-5 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={view === "technical" ? 6 : 5}
                    className="p-10 text-center text-ui-fg-subtle"
                    role="status"
                  >
                    Loading activity…
                  </td>
                </tr>
              ) : error && !data.events.length ? (
                <tr>
                  <td
                    colSpan={view === "technical" ? 6 : 5}
                    className="p-10 text-center"
                  >
                    Activity could not be loaded. Refresh to try again.
                  </td>
                </tr>
              ) : !data.events.length ? (
                <tr>
                  <td
                    colSpan={view === "technical" ? 6 : 5}
                    className="p-10 text-center"
                  >
                    No activity matches these filters.
                  </td>
                </tr>
              ) : (
                data.events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-t border-ui-border-base align-top hover:bg-ui-bg-subtle-hover"
                  >
                    <td className="whitespace-nowrap px-5 py-4">
                      <time
                        dateTime={event.created_at}
                        title={new Date(event.created_at).toISOString()}
                      >
                        {new Date(event.created_at).toLocaleDateString()}
                        <span className="mt-1 block text-xs text-ui-fg-subtle">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                      </time>
                    </td>
                    <td className="max-w-[240px] px-5 py-4">
                      <Text
                        size="small"
                        weight="plus"
                        className="truncate"
                        title={event.actor_email || event.actor_id}
                      >
                        {event.actor_name ||
                          event.actor_email ||
                          (event.actor_id === "cli" ? "CLI" : event.actor_id)}
                      </Text>
                      {view === "technical" &&
                        event.actor_name &&
                        event.actor_email && (
                          <Text
                            size="small"
                            className="mt-1 truncate text-ui-fg-subtle"
                            title={event.actor_email}
                          >
                            {event.actor_email}
                          </Text>
                        )}
                      <Text size="small" className="mt-1 text-ui-fg-subtle">
                        {event.actor_kind === "superadmin"
                          ? "Superadmin"
                          : event.actor_role ||
                            event.actor_kind ||
                            "Earlier record"}
                        {event.action === "auth.login_failed"
                          ? " · Unverified attempt"
                          : ""}
                      </Text>
                      {view === "activity" &&
                        ["auth.login", "auth.login_failed"].includes(
                          event.action
                        ) && (
                          <Text size="small" className="mt-2 text-ui-fg-muted">
                            {locationLabel(event.location)}
                          </Text>
                        )}
                    </td>
                    <td className="max-w-[280px] px-5 py-4">
                      <Text size="small" weight="plus">
                        {eventLabel(event)}
                      </Text>
                      <Text
                        size="small"
                        className="mt-1 break-all text-ui-fg-subtle"
                      >
                        {view === "technical"
                          ? `${event.method ? `${event.method} ` : ""}${event.path || event.target_id}`
                          : activityArea(event)}
                      </Text>
                      {event.repeat_count > 1 && (
                        <Text size="small" className="mt-2 text-ui-fg-muted">
                          {event.repeat_count} visits grouped
                        </Text>
                      )}
                    </td>
                    {view === "technical" && (
                      <td className="max-w-[230px] px-5 py-4">
                        {view === "technical" ||
                        ["auth.login", "auth.login_failed"].includes(
                          event.action
                        ) ? (
                          <>
                            <Text size="small">
                              {locationLabel(event.location)}
                            </Text>
                            <Text
                              size="small"
                              className="mt-1 break-all text-ui-fg-muted"
                            >
                              {event.ip_address || "IP not recorded"}
                            </Text>
                          </>
                        ) : (
                          <Text size="small" className="text-ui-fg-muted">
                            —
                          </Text>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <Outcome
                        status={event.status_code}
                        technical={view === "technical"}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setSelected(event)}
                        aria-label={`View event ${event.id}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ui-border-base px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {data.count
              ? `${offset + 1}–${Math.min(offset + limit, data.count)} of ${data.count}`
              : "0 events"}{" "}
            · Times: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Text>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={loading || offset + limit >= data.count}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      </Container>
      <Drawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Activity details</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            <Drawer.Description>
              Request and identity details recorded for this event. Passwords,
              tokens, query values and request contents are excluded.
            </Drawer.Description>
            {selected && (
              <div className="mt-6 space-y-6">
                <div>
                  <Heading level="h2">{eventLabel(selected)}</Heading>
                  <div className="mt-2">
                    <Outcome status={selected.status_code} technical />
                  </div>
                </div>
                {selected.repeat_count > 1 && (
                  <Text className="rounded-lg bg-ui-bg-subtle p-3">
                    {selected.repeat_count} consecutive page visits grouped.
                    First:{" "}
                    {new Date(selected.first_occurred_at).toLocaleString()}.
                    Last: {new Date(selected.created_at).toLocaleString()}. Each
                    original record is available in Technical Requests.
                  </Text>
                )}
                <dl className="space-y-4 text-sm">
                  {[
                    ["Admin", selected.actor_email || selected.actor_id],
                    ["Name", selected.actor_name],
                    [
                      "Role at the time",
                      selected.actor_kind === "superadmin"
                        ? "Superadmin"
                        : selected.actor_role,
                    ],
                    ["Timestamp", new Date(selected.created_at).toISOString()],
                    [
                      "Request / page",
                      `${selected.method || ""} ${selected.path || selected.target_id}`.trim(),
                    ],
                    ["IP address", selected.ip_address],
                    ["Location", locationLabel(selected.location)],
                    [
                      "Location source",
                      selected.location.source === "offline_ip"
                        ? "Offline IP database · approximate"
                        : selected.location.source === "local"
                          ? "Local/private network"
                          : "Not recorded / unavailable",
                    ],
                    [
                      "Approximate coordinates",
                      selected.location.latitude !== undefined
                        ? `${selected.location.latitude}, ${selected.location.longitude}`
                        : null,
                    ],
                    [
                      "Accuracy radius",
                      selected.location.accuracy_km
                        ? `${selected.location.accuracy_km} km`
                        : null,
                    ],
                    ["Location timezone", selected.location.timezone],
                    ["Browser / device", selected.user_agent],
                    [
                      "Duration",
                      selected.duration_ms !== null
                        ? `${selected.duration_ms} ms`
                        : null,
                    ],
                    ["Request ID", selected.request_id],
                    ["Event ID", selected.id],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-ui-fg-subtle">{label}</dt>
                      <dd className="mt-1 break-words">
                        {value || "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
                {selected.target_id !== selected.path && (
                  <div>
                    <Heading level="h2">Target resource</Heading>
                    <Text className="mt-2 break-all">{selected.target_id}</Text>
                  </div>
                )}
                {Object.keys(selected.details || {}).length > 0 && (
                  <div>
                    <Heading level="h2">Recorded details</Heading>
                    <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-ui-bg-subtle p-3 text-xs">
                      {JSON.stringify(selected.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </>
  )
}
export const config = defineRouteConfig({
  label: "Activity Log",
  icon: ClockSolid,
})
