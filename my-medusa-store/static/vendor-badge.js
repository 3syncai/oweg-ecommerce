// Global script to add vendor notification badge
;(function() {
  'use strict'
  
  // Prevent multiple initializations
  if (window.__vendorBadgeInitialized) return
  window.__vendorBadgeInitialized = true

  let styleInjected = false
  let intervalId = null
  
  async function updateVendorBadge() {
    try {
      // Check for conflicting badges from React widgets
      const conflictingIds = [
        'vendor-requests-global-badge', 
        'vendor-badge-style', 
        'vendor-badge-global-style'
      ]
      
      const hasConflict = conflictingIds.some(id => document.getElementById(id))
      
      // If a widget badge exists, cleanup our static badge and exit
      if (hasConflict) {
        const myStyle = document.getElementById('vendornotifbadge')
        if (myStyle) {
          myStyle.remove()
          styleInjected = false
        }
        return
      }

      const res = await fetch('/admin/vendors/pending', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!res.ok) return
      
      const data = await res.json()
      const count = data?.vendors?.length || 0
      
      const styleId = 'vendornotifbadge'
      let style = document.getElementById(styleId)
      
      if (count > 0) {
        if (!style) {
          style = document.createElement('style')
          style.id = styleId
          document.head.appendChild(style)
        }
        
        style.textContent = `
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
        styleInjected = true
      } else if (style) {
        style.remove()
        styleInjected = false
      }
    } catch (err) {
      console.error('Vendor badge:', err)
    }
  }
  
  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateVendorBadge)
  } else {
    updateVendorBadge()
  }
  
  // Refresh every 30s
  intervalId = setInterval(updateVendorBadge, 30000)

  // Cleanup on unload to prevent leaks
  window.addEventListener('beforeunload', () => {
    if (intervalId) clearInterval(intervalId)
  })
})()
