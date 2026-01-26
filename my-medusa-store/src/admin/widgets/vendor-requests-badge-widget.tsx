import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

const VendorBadge = () => {
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch("/admin/vendors/pending", { 
          credentials: "include" 
        } as RequestInit)
        if (res.ok) {
          const data = await res.json()
          const pendingCount = data?.vendors?.length || 0
          
          // Inject CSS for the badge
          if (pendingCount > 0) {
            const styleId = "vendor-badge-style"
            let styleEl = document.getElementById(styleId) as HTMLStyleElement
            
            if (!styleEl) {
              styleEl = document.createElement("style")
              styleEl.id = styleId
              document.head.appendChild(styleEl)
            }
            
            styleEl.textContent = `
              a[href="/app/vendor-requests"]::after {
                content: "${pendingCount > 99 ? '99+' : pendingCount}";
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                background-color: #ef4444;
                color: white;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 600;
                padding: 2px 6px;
                min-width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
              }
              
              a[href="/app/vendor-requests"] {
                position: relative !important;
              }
            `
          }
        }
      } catch (error) {
        console.error("Badge error:", error)
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default VendorBadge
