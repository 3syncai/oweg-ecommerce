"use client"

import { useEffect } from "react"
import { Container, Heading, Text } from "@medusajs/ui"
import VendorShell from "../../../components/VendorShell"

const VendorCustomersPage = () => {
  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      window.location.href = "/app/login"
    }
  }, [])

  return (
    <VendorShell>
      <Container className="p-6 space-y-4">
        <Heading level="h1">Customers</Heading>
        <Text className="text-ui-fg-subtle">This is customer page</Text>
      </Container>
    </VendorShell>
  )
}

export default VendorCustomersPage

