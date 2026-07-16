"use client"

import { useCallback, useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import { ArrowPath, ChatBubble } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import { vendorPayoutsApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type VendorMessage = {
  id: string
  kind: "credited" | "payout"
  title: string
  body: string
  amount: number
  createdAt: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatMessageTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

const VendorMessagesPage = () => {
  const router = useRouter()
  const [messages, setMessages] = useState<VendorMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMessages = useCallback(async () => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    try {
      const [summaryRes, listRes] = await Promise.all([
        vendorPayoutsApi.summary().catch(() => null),
        vendorPayoutsApi.list().catch(() => null),
      ])

      const next: VendorMessage[] = []

      for (const row of summaryRes?.summary?.credited_recent || []) {
        const amount = Number(row.net_amount) || 0
        if (amount <= 0) continue
        next.push({
          id: `credited:${row.id}`,
          kind: "credited",
          title: "Payment credited",
          body: `Order #${row.order_display_id || row.order_id.slice(0, 8)} credited to your payout balance`,
          amount,
          createdAt: row.credited_at || new Date().toISOString(),
        })
      }

      const payoutRows =
        listRes?.payouts ||
        (summaryRes as { payouts?: any[] } | null)?.payouts ||
        []

      for (const payout of payoutRows) {
        if (String(payout.status || "").toLowerCase() !== "processed") continue
        const amount = Number(payout.net_amount) || 0
        if (amount <= 0) continue
        next.push({
          id: `payout:${payout.id}`,
          kind: "payout",
          title: "Payout received",
          body: payout.transaction_id
            ? `Admin paid out to your account · Txn ${payout.transaction_id}`
            : "Admin paid out to your account",
          amount,
          createdAt: payout.created_at || payout.updated_at || new Date().toISOString(),
        })
      }

      next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setMessages(next)
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load messages")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadMessages()
  }

  let content

  if (loading) {
    content = <PageSkeleton label="Loading messages…" stats={0} rows={4} cols={1} showAction />
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Messages
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              Credits and admin payouts for your account
            </Text>
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
          {messages.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ui-bg-subtle text-ui-fg-muted">
                <ChatBubble />
              </div>
              <Text weight="plus" className="text-ui-fg-base">
                No messages yet
              </Text>
              <Text size="small" className="mt-2 text-ui-fg-subtle">
                When orders are credited or admin pays you, those updates appear here.
              </Text>
            </div>
          ) : (
            <div className="divide-y divide-ui-border-base/70">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text weight="plus">{message.title}</Text>
                      <span
                        className={
                          message.kind === "payout"
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                            : "rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                        }
                      >
                        {message.kind === "payout" ? "Payout" : "Credit"}
                      </span>
                    </div>
                    <Text size="small" className="mt-1 text-ui-fg-subtle">
                      {message.body}
                    </Text>
                    {message.createdAt ? (
                      <Text size="small" className="mt-1 text-ui-fg-muted">
                        {formatMessageTime(message.createdAt)}
                      </Text>
                    ) : null}
                  </div>
                  <Text className="shrink-0 font-medium text-emerald-600">
                    +{formatCurrency(message.amount)}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorMessagesPage
