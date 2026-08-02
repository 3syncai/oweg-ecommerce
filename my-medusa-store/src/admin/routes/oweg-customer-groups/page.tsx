"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

/**
 * Dashboard patch clears nested Customers → Customer Groups.
 * This promoted extension restores a visible sidebar entry that opens
 * the core Medusa Customer Groups page.
 *
 * Direct URL (works even before redeploy): /app/customer-groups
 */
const OwegCustomerGroupsRedirect = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigate("/customer-groups", { replace: true })
  }, [navigate])

  return (
    <Container className="p-6">
      <Heading level="h1">Customer Groups</Heading>
      <Text size="small" className="text-ui-fg-subtle mt-2">
        Opening Customer Groups…
      </Text>
      <Text size="small" className="text-ui-fg-muted mt-1">
        If this does not redirect, open /app/customer-groups directly.
      </Text>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Customer Groups",
  icon: Users,
})

export default OwegCustomerGroupsRedirect
