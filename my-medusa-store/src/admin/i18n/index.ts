import en from "./json/en.json"
import { installAdminAuthFetch } from "../lib/admin-auth-fetch"
import { initAdminAccessUi } from "../lib/admin-access-ui"

import { initAuthPageBranding } from "../lib/auth-page-branding"
import { initDraftPaymentStatusUi } from "../lib/draft-payment-status-ui"
import { initHideNotificationsUi } from "../lib/hide-notifications-ui"
import { initInventoryTableLayout } from "../lib/inventory-table-layout"
import { initOrderDetailLayout } from "../lib/order-detail-layout"
import { initSidebarBranding } from "../lib/sidebar-branding"
import { initSidebarChromeHide } from "../lib/sidebar-chrome-hide"
import owegLogo from "../assets/oweg-logo.png"
import owegWordmark from "../assets/oweg-wordmark.svg"

// Cross-origin admin → API must use JWT Bearer, not third-party session cookies.
installAdminAuthFetch()
initAuthPageBranding(owegWordmark)
initSidebarBranding(owegLogo)
initSidebarChromeHide()
initHideNotificationsUi()
initDraftPaymentStatusUi()
initInventoryTableLayout()
initOrderDetailLayout()
initAdminAccessUi()

const messages = {
    en: {
        translation: en,
    },
}

export default messages
