import { defineWidgetConfig } from "@medusajs/admin-sdk"

const VendorSignupLink = () => {
  return (
    <div className="inter-small-regular text-ui-fg-subtle" style={{ marginTop: 12 }}>
      Not a user yet?{" "}
      <a
        href="/public/vendors/form"
        className="text-ui-fg-interactive hover:underline"
      >
        Become a vendor
      </a>
    </div>
  )
}

export const config = defineWidgetConfig({
  // Inject a widget under the admin login card
  zone: "login.after",
})

export default VendorSignupLink


