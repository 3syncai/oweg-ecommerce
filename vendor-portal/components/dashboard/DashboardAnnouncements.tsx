"use client"

import Link from "next/link"
import { Text, clx } from "@medusajs/ui"

const ANNOUNCEMENTS = [
  {
    id: "maintenance",
    tone: "warning" as const,
    title: "System Maintenance",
    description: "Scheduled window this weekend. Expect brief downtime.",
    date: "20 May 2025",
  },
  {
    id: "feature",
    tone: "info" as const,
    title: "New Feature Update",
    description: "Faster order acceptance and clearer payout timelines.",
    date: "18 May 2025",
  },
  {
    id: "reminder",
    tone: "error" as const,
    title: "Important Reminder",
    description: "Keep return tracking complete before marking pickup.",
    date: "15 May 2025",
  },
]

const toneClass: Record<(typeof ANNOUNCEMENTS)[number]["tone"], string> = {
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
}

type DashboardAnnouncementsProps = {
  className?: string
}

const DashboardAnnouncements = ({ className }: DashboardAnnouncementsProps) => (
  <div
    className={clx(
      "rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-ui-border-base/70 dark:bg-ui-bg-base",
      className
    )}
  >
    <div className="mb-3 flex items-center justify-between gap-2">
      <Text weight="plus" className="text-[15px] text-zinc-900 dark:text-ui-fg-base">
        Announcements
      </Text>
      <Link
        href="/claims"
        className="text-xs font-medium text-emerald-700 no-underline hover:underline dark:text-oweg-600"
      >
        View all
      </Link>
    </div>
    <div className="space-y-3">
      {ANNOUNCEMENTS.map((item) => (
        <div
          key={item.id}
          className="flex gap-3 rounded-xl border border-zinc-100 px-3 py-2.5 dark:border-ui-border-base/60"
        >
          <span
            className={clx(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
              toneClass[item.tone]
            )}
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <Text weight="plus" className="truncate text-sm text-zinc-900 dark:text-ui-fg-base">
              {item.title}
            </Text>
            <Text size="xsmall" className="mt-0.5 line-clamp-2 text-zinc-500 dark:text-ui-fg-subtle">
              {item.description}
            </Text>
            <Text size="xsmall" className="mt-1 text-zinc-400 dark:text-ui-fg-muted">
              {item.date}
            </Text>
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default DashboardAnnouncements
