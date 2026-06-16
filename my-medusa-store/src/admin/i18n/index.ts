import en from "./json/en.json"

import { initAuthPageBranding } from "../lib/auth-page-branding"
import owegLogo from "../assets/oweg-logo.png"

initAuthPageBranding(owegLogo)

const messages = {
    en: {
        translation: en,
    },
}

export default messages
