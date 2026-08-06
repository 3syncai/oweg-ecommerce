import en from "./json/en.json"

import { initAuthPageBranding } from "../lib/auth-page-branding"
import { initDraftPaymentStatusUi } from "../lib/draft-payment-status-ui"
import { initHideNotificationsUi } from "../lib/hide-notifications-ui"
import { initInventoryTableLayout } from "../lib/inventory-table-layout"
import { initSidebarBranding } from "../lib/sidebar-branding"
import { initSidebarChromeHide } from "../lib/sidebar-chrome-hide"
import owegLogo from "../assets/oweg-logo.png"

initAuthPageBranding(owegLogo)
initSidebarBranding(owegLogo)
initSidebarChromeHide()
initHideNotificationsUi()
initDraftPaymentStatusUi()
initInventoryTableLayout()

const messages = {
    en: {
        translation: en,
    },
}

export default messages
