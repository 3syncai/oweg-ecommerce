"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Customers page removed — redirect to dashboard. */
export default function CustomersRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard")
  }, [router])

  return null
}
