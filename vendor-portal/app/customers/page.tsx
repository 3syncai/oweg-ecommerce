"use client"

import { useEffect, useState } from "react"
import { Container, Text } from "@medusajs/ui"
import { Star, Users } from "lucide-react"
import VendorShell from "@/components/VendorShell"
import PageHeader from "@/components/PageHeader"
import PageSkeleton from "@/components/PageSkeleton"
import { vendorCustomersApi } from "@/lib/api/client"

type Customer = {
  id: string
  email: string | null
  first_name?: string | null
  last_name?: string | null
  orders_count: number
  customer_reliability: {
    rating: number | null
    label: string
    eligible_orders: number
    returns_count: number
    replacements_count: number
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    vendorCustomersApi.list()
      .then((response) => setCustomers(response.customers || []))
      .finally(() => setLoading(false))
  }, [])

  return <VendorShell>
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7">
      <PageHeader icon={<Users size={22} />} title="Customers" description="Customer history rating from completed returns and replacements." />
      <Container className="overflow-hidden p-0">
        {loading ? <PageSkeleton label="Loading customer ratings…" className="min-h-[260px]" /> : (
          <div className="divide-y divide-ui-border-base">
            {customers.map((customer) => {
              const reliability = customer.customer_reliability
              const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Customer"
              return <div key={customer.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Text weight="plus">{name}</Text>
                  <Text size="small" className="text-ui-fg-muted">{customer.email || "Details hidden"} · {customer.orders_count} order{customer.orders_count === 1 ? "" : "s"}</Text>
                </div>
                {reliability.rating == null ? <span className="text-sm text-ui-fg-muted">New customer</span> : <span title={`${reliability.returns_count} completed return(s), ${reliability.replacements_count} replacement(s)`} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300"><Star size={15} fill="currentColor" /> {reliability.rating.toFixed(1)} / 5 · {reliability.label}</span>}
              </div>
            })}
            {!customers.length ? <div className="p-10 text-center text-ui-fg-muted">No customer history yet.</div> : null}
          </div>
        )}
      </Container>
    </main>
  </VendorShell>
}
