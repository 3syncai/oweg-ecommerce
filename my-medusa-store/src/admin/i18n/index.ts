import en from "./json/en.json"

import { initAuthPageBranding } from "../lib/auth-page-branding"
import { initSidebarBranding } from "../lib/sidebar-branding"
import owegLogo from "../assets/oweg-logo.png"

initAuthPageBranding(owegLogo)
initSidebarBranding(owegLogo)

const messages = {
    en: {
        translation: en,
    },
}

export default messages
