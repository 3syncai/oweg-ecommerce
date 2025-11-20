"use client"

import { useEffect, useState } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

const isVendorRoute = () =>
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/app/vendor") &&
  !!localStorage.getItem("vendor_token")

const VendorLayoutWidget = () => {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const update = () => {
      setActive(isVendorRoute())
    }

    update()
    
    const interval = window.setInterval(update, 500)
    window.addEventListener("storage", update)
    window.addEventListener("popstate", update)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("storage", update)
      window.removeEventListener("popstate", update)
    }
  }, [])

  useEffect(() => {
    const body = document.body
    if (!body) {
      return
    }

    if (active) {
      body.classList.add("vendor-shell-active")
      body.style.overflow = "hidden"
    } else {
      body.classList.remove("vendor-shell-active")
      body.style.overflow = ""
      }
  }, [active])

  return null
}

export const config = defineWidgetConfig({
  zone: [], // Run globally to track vendor sessions
})

export default VendorLayoutWidget

