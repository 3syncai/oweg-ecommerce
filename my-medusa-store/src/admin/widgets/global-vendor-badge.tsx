import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

/**
 * Global badge widget - loads on ALL admin pages
 * Injects vendor notification badge into sidebar
 */
const GlobalVendorBadge = () => {
  useEffect(() => {
    const updateBadge = async () => {
      try {
        const res = await fetch("/admin/vendors/pending", { 
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        })
        
        if (res.ok) {
          const data = await res.json()
          const count = data?.vendors?.length || 0
          
          const styleId = "vendor-requests-global-badge"
          let styleEl = document.getElementById(styleId) as HTMLStyleElement
          
          if (count > 0) {
            if (!styleEl) {
              styleEl = document.createElement("style")
              styleEl.id = styleId
              document.head.appendChild(styleEl)
            }
            
            styleEl.textContent = `
              a[href="/app/vendor-requests"] {
                position: relative !important;
              }
              a[href="/app/vendor-requests"]::after {
                content: "";
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                background-color: #ef4444;
                border-radius: 50%;
                box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
                z-index: 999;
              }
            `
          } else {
            if (styleEl) {
              styleEl.remove()
            }
          }
        }
      } catch (err) {
        console.error("Vendor badge error:", err)
      }
    }

    updateBadge()
    const interval = setInterval(updateBadge, 30000)
    return () => clearInterval(interval)
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default GlobalVendorBadge
