"use client"

import { useEffect } from "react"

const AdminRouteGuard = () => {
  useEffect(() => {
    // Check if we're on an admin route (not vendor route)
    const isVendorRoute = window.location.pathname.startsWith("/app/vendor-")
    const isLoginPage = window.location.pathname === "/app/login"
    
    if (!isVendorRoute && !isLoginPage) {
      const vendorToken = localStorage.getItem("vendor_token")
      const adminToken = localStorage.getItem("admin_token")
      
      // If admin route but vendor token exists, redirect to vendor dashboard
      if (vendorToken && !adminToken) {
        window.location.href = "/app/vendor-dashboard"
        return
      }
      
      // If admin route but no tokens, redirect to login
      if (!vendorToken && !adminToken) {
        window.location.href = "/app/login"
        return
      }
    }
  }, [])

  return null
}

export default AdminRouteGuard

