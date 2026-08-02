import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

/**
 * Dashboard patch clears nested Customers → Customer Groups.
 * This extension restores a visible nav entry that opens the core page.
 */
const OwegCustomerGroupsRedirect = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigate("/customer-groups", { replace: true })
  }, [navigate])

  return null
}

export const config = defineRouteConfig({
  label: "Customer Groups",
  icon: Users,
})

export default OwegCustomerGroupsRedirect
