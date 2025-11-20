import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import Vendor from "./models/vendor"
import VendorUser from "./models/vendor-user"
import bcrypt from "bcryptjs"

class VendorModuleService extends MedusaService({
  Vendor,
  VendorUser,
}) {
  async createPendingVendor(input: {
    name: string
    email: string
    phone?: string | null
    pan_gst?: string | null
    documents?: Array<{ key: string; url: string; name?: string; type?: string }> | null
    store_name?: string | null
    store_logo?: string | null
  }) {
    const exists = await this.listVendors({ email: input.email })
    if (exists && exists.length > 0) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Vendor with email already exists")
    }
    return await this.createVendors({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      pan_gst: input.pan_gst ?? null,
      documents: (input.documents ?? null) as any,
      store_name: input.store_name ?? null,
      store_logo: input.store_logo ?? null,
      is_approved: false,
    })
  }

  async approveVendor(vendorId: string, adminId?: string | null) {
    // Validate the ID
    if (!vendorId || typeof vendorId !== 'string' || vendorId.trim() === '') {
      console.error("Invalid vendorId received:", vendorId)
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Valid vendor ID is required")
    }

    console.log("Service: Retrieving vendor with ID:", vendorId)

    // Get vendor
    const vendors = await this.listVendors({ id: vendorId })
    
    if (!vendors || vendors.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`)
    }

    const vendor = vendors[0]

    if (vendor.is_approved) {
      console.log("Vendor already approved")
      return vendor
    }

    console.log("Service: Updating vendor approval status")

    // CRITICAL FIX: Use correct Medusa v2 updateVendors signature
    // The first parameter should be an object with id + update data
    const updated = await this.updateVendors({
      id: vendorId,
      is_approved: true,
      approved_at: new Date(),
      approved_by: adminId || null,
    })

    console.log("Service: Vendor approved successfully")

    // Auto-create vendor_user if it doesn't exist
    try {
      const existingUsers = await this.listVendorUsers({ vendor_id: vendorId })
      if (!existingUsers || existingUsers.length === 0) {
        // Generate a temporary password
        const tempPassword = `Temp${Math.random().toString(36).slice(-8)}!`
        await this.createVendorUser({
          email: vendor.email,
          password: tempPassword,
          vendor_id: vendorId,
        })
        // Set must_reset_password to true
        const newUser = await this.listVendorUsers({ vendor_id: vendorId })
        if (newUser && newUser.length > 0) {
          await this.updateVendorUsers({
            id: newUser[0].id,
            must_reset_password: true,
          })
        }
        console.log("Auto-created vendor_user with temp password")
      }
    } catch (e) {
      console.log("Vendor user creation skipped:", e)
    }

    // Try marketplace integration (only if enabled)
    if (process.env.MARKETPLACE_INTEGRATION === "true") {
      try {
        const container = (this as any).__container__ || (this as any).container
        if (container && container.resolve) {
          const marketplace: any = container.resolve("marketplaceService")
          if (marketplace && marketplace.createSeller) {
            const seller = await marketplace.createSeller({
              email: vendor.email,
              name: vendor.name,
              phone: vendor.phone,
              store_name: vendor.store_name,
              tax_id: vendor.pan_gst,
              metadata: { vendor_id: vendorId },
            })
            const sellerId = seller?.id || seller
            if (sellerId) {
              await this.updateVendors({
                id: vendorId,
                marketplace_seller_id: sellerId
              })
            }
          }
        }
      } catch (e) {
        console.log("Marketplace integration skipped:", e)
      }
    }

    return updated
  }

  async ensureApproved(vendorId: string) {
    const vendors = await this.listVendors({ id: vendorId })
    if (!vendors || vendors.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
    }
    const vendor = vendors[0]
    if (!vendor.is_approved) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Vendor not approved")
    }
    return vendor
  }

  async createVendorUser(input: { email: string; password: string; vendor_id: string }) {
    const existing = await this.listVendorUsers({ email: input.email })
    if (existing && existing.length > 0) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Vendor user with email already exists")
    }
    const password_hash = await bcrypt.hash(input.password, 10)
    return await this.createVendorUsers({
      email: input.email,
      password_hash,
      vendor_id: input.vendor_id,
    })
  }

  async authenticateVendorUser(email: string, password: string) {
    const users = await this.listVendorUsers({ email })
    if (!users || users.length === 0) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }
    const user = users[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }
    // Update last login
    await this.updateVendorUsers({
      id: user.id,
      last_login_at: new Date()
    })
    return user
  }
}

export default VendorModuleService