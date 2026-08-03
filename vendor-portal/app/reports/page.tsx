"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Legacy /reports → /claims */
export default function ReportsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/claims")
  }, [router])
  return null
}
