// Custom RemoteQuery entry points for the vendor module.
// Kept outside of generated .medusa files so Medusa CLI can regenerate safely.
declare module "@medusajs/framework/types" {
  interface RemoteQueryEntryPoints {
    vendor: any
    vendors: any
    vendor_user: any
    vendor_users: any
  }
}
