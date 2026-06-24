"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import VendorShell from "@/components/VendorShell"

function SettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard?settings=1")
  }, [router])

  return null
}

export default function SettingsPage() {
  return (
    <VendorShell>
      <SettingsRedirect />
    </VendorShell>
  )
}
