"use client"

import Link from "next/link"
import { Text, clx } from "@medusajs/ui"
import { ArrowRightMini, DocumentText, Plus, ShoppingCart } from "@medusajs/icons"

const ACTIONS = [
  {
    href: "/products/new",
    label: "Add new product",
    icon: Plus,
  },
  {
    href: "/orders",
    label: "View all orders",
    icon: ShoppingCart,
  },
  {
    href: "/payout",
    label: "Download reports",
    icon: DocumentText,
  },
] as const

type DashboardQuickActionsProps = {
  className?: string
}

const DashboardQuickActions = ({ className }: DashboardQuickActionsProps) => (
  <div
    className={clx(
      "rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-ui-border-base/70 dark:bg-ui-bg-base",
      className
    )}
  >
    <Text weight="plus" className="mb-3 text-[15px] text-zinc-900 dark:text-ui-fg-base">
      Quick actions
    </Text>
    <div className="space-y-2">
      {ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.href + action.label}
            href={action.href}
            className="group flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 text-inherit no-underline transition hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-ui-border-base/60 dark:bg-ui-bg-subtle/40 dark:hover:bg-ui-bg-subtle"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:bg-oweg-500/15 dark:text-oweg-700">
              <Icon />
            </span>
            <Text className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-ui-fg-base">
              {action.label}
            </Text>
            <ArrowRightMini className="shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-ui-fg-muted" />
          </Link>
        )
      })}
    </div>
  </div>
)

export default DashboardQuickActions
