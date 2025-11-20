"use client"

import { useEffect } from "react"

type MainStyles = {
  marginLeft?: string
  paddingLeft?: string
  background?: string
}

/**
 * Hides the default Medusa admin sidebar and resets the main content shell
 * while a vendor route is mounted. Restores everything on cleanup so admin
 * routes keep working normally.
 */
export const useVendorShell = () => {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const managedElements = new Set<HTMLElement>()
    const mainElements = new Map<HTMLElement, MainStyles>()
    const body = document.body

    body.classList.add("vendor-mode")

    const applyVendorShell = () => {
      const asides = document.querySelectorAll<HTMLElement>("aside")

      asides.forEach((aside) => {
        if (aside.dataset.vendorSidebar === "true") {
          return
        }

        if (!managedElements.has(aside)) {
          managedElements.add(aside)
          aside.dataset.vendorPrevDisplay = aside.style.display || ""
        }

        aside.style.setProperty("display", "none", "important")
      })

      const main = document.querySelector<HTMLElement>("main")
      if (main) {
        if (!mainElements.has(main)) {
          mainElements.set(main, {
            marginLeft: main.style.marginLeft || "",
            paddingLeft: main.style.paddingLeft || "",
            background: main.style.background || "",
          })
        }

        main.style.marginLeft = "0"
        main.style.paddingLeft = "0"
        main.style.background = "transparent"
      }
    }

    applyVendorShell()
    const interval = window.setInterval(applyVendorShell, 300)

    return () => {
      window.clearInterval(interval)
      body.classList.remove("vendor-mode")

      managedElements.forEach((element) => {
        const prev = element.dataset.vendorPrevDisplay ?? ""
        if (prev) {
          element.style.display = prev
        } else {
          element.style.removeProperty("display")
        }
        delete element.dataset.vendorPrevDisplay
      })

      mainElements.forEach((styles, element) => {
        element.style.marginLeft = styles.marginLeft ?? ""
        element.style.paddingLeft = styles.paddingLeft ?? ""
        element.style.background = styles.background ?? ""
      })
    }
  }, [])
}

export default useVendorShell

