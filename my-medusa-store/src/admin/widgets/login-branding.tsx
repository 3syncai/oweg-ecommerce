import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import owegLogo from "../assets/oweg-logo.png"

const STYLE_ID = "oweg-login-branding"
const LOGO_ID = "oweg-login-logo"

const LoginBrandingWidget = () => {
  useEffect(() => {
    const container = document.querySelector<HTMLElement>(
      ".max-w-\\[280px\\].flex-col.items-center"
    )
    if (!container) {
      return
    }

    const avatarBox = container.querySelector<HTMLElement>(
      ".mb-4.h-\\[50px\\].w-\\[50px\\]"
    )
    avatarBox?.style.setProperty("display", "none")

    if (!document.getElementById(LOGO_ID)) {
      const logo = document.createElement("img")
      logo.id = LOGO_ID
      logo.src = owegLogo
      logo.alt = "OWEG"
      logo.className = "mb-4 size-16 object-contain"
      container.insertBefore(logo, container.firstChild)
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style")
      style.id = STYLE_ID
      style.textContent = `
        .max-w-\\[280px\\] > .mb-4.h-\\[50px\\].w-\\[50px\\] {
          display: none !important;
        }
      `
      document.head.appendChild(style)
    }

    return () => {
      avatarBox?.style.removeProperty("display")
      document.getElementById(LOGO_ID)?.remove()
      document.getElementById(STYLE_ID)?.remove()
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default LoginBrandingWidget
