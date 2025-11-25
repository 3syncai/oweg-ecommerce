"use client"

import { useEffect } from "react"

const AdminRouteGuard = () => {
  useEffect(() => {
    const isLoginPage = window.location.pathname === "/app/login"
    
    if (!isLoginPage) {
      const adminToken = localStorage.getItem("admin_token")
      
      // If admin route but no token, redirect to login
      if (!adminToken) {
        window.location.href = "/app/login"
        return
      }
    }
  }, [])

  return null
}

export default AdminRouteGuard

