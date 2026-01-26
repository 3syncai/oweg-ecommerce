import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

const VendorBadgeGlobal = () => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const updateBadge = async () => {
      try {
        const res = await fetch("/admin/vendors/pending", { 
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        })
        
        if (res.ok) {
          const data = await res.json()
          const pendingCount = data?.vendors?.length || 0
          setCount(pendingCount)
          
          const styleId = "vendor-badge-global-style"
          let styleEl = document.getElementById(styleId) as HTMLStyleElement
          
          if (pendingCount > 0) {
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
                z-index: 10;
              }
            `
          } else {
            if (styleEl) {
              styleEl.remove()
            }
          }
        }
      } catch (error) {
        console.error("Vendor badge error:", error)
      }
    }

    updateBadge()
    const interval = setInterval(updateBadge, 30000)
    return () => clearInterval(interval)
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default VendorBadgeGlobal
