"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

const OwegHomepagePage = () => {
  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-4 px-6 py-6">
        <div className="flex flex-col gap-y-2">
          <Heading level="h1">Oweg.in Homepage</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Manage storefront homepage content — featured brands and mega menu category banners.
          </Text>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/oweg-homepage/brands"
            className="rounded-lg border border-ui-border-base p-4 transition-colors hover:bg-ui-bg-subtle-hover"
          >
            <Heading level="h2">Featured Brands</Heading>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              Choose which brands appear on the homepage carousel.
            </Text>
          </Link>
          <Link
            to="/oweg-homepage/mega-menu-banners"
            className="rounded-lg border border-ui-border-base p-4 transition-colors hover:bg-ui-bg-subtle-hover"
          >
            <Heading level="h2">Mega Menu Banners</Heading>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              Upload vertical banners for header mega menu categories.
            </Text>
          </Link>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Oweg.in Homepage",
})

export default OwegHomepagePage
