"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

const AdminRouteGuard = () => {
  const router = useRouter()
  const pathname = usePathname()
  
  useEffect(() => {
    const isLoginPage = pathname === "/app/login"
    
    if (!isLoginPage) {
      const adminToken = localStorage.getItem("admin_token")
      
      // If admin route but no token, redirect to login
      if (!adminToken) {
        router.push("/app/login")
        return
      }
    }
  }, [pathname, router])

  return null
}

export default AdminRouteGuard

