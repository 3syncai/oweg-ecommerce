import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import Vendor from "./models/vendor"
import VendorUser from "./models/vendor-user"
import bcrypt from "bcryptjs"

class VendorModuleService extends MedusaService({
  Vendor,
  VendorUser,
}) {
  async createPendingVendor(input: {
    // Personal Information
    name: string
    firstName?: string | null
    lastName?: string | null
    email: string
    phone?: string | null
    telephone?: string | null

    // Store Information
    store_name?: string | null
    store_phone?: string | null
    store_address?: string | null
    store_country?: string | null
    store_region?: string | null
    store_city?: string | null
    store_pincode?: string | null
    store_logo?: string | null
    store_banner?: string | null
    shipping_policy?: string | null
    return_policy?: string | null
    whatsapp_number?: string | null

    // Tax & Legal Information
    pan_gst?: string | null
    gst_no?: string | null
    pan_no?: string | null

    // Banking Information
    bank_name?: string | null
    account_no?: string | null
    ifsc_code?: string | null
    cancel_cheque_url?: string | null

    // Documents
    documents?: Array<{ key: string; url: string; name?: string; type?: string }> | null
  }) {
    // Check for duplicates
    const allVendors = await this.listVendors({})
    
    // Check email
    const emailExists = allVendors.some((v: any) => v.email?.toLowerCase() === input.email.toLowerCase())
    if (emailExists) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Email already exists")
    }

    // Check phone/telephone (normalize by removing non-digits)
    if (input.phone || input.telephone) {
      const phoneDigits = (input.phone || input.telephone || "").replace(/\D/g, "")
      if (phoneDigits) {
        const phoneExists = allVendors.some((v: any) => {
          const vPhone = (v.phone || "").replace(/\D/g, "")
          const vTelephone = (v.telephone || "").replace(/\D/g, "")
          return vPhone === phoneDigits || vTelephone === phoneDigits
        })
        if (phoneExists) {
          throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Phone number already exists")
        }
      }
    }

    // Check PAN number
    if (input.pan_no) {
      const panValue = input.pan_no.toUpperCase().replace(/\s/g, "")
      const panExists = allVendors.some((v: any) => {
        const vPan = (v.pan_no || "").toUpperCase().replace(/\s/g, "")
        return vPan === panValue && vPan !== ""
      })
      if (panExists) {
        throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "PAN number already exists")
      }
    }

    // Check GST number
    if (input.gst_no) {
      const gstValue = input.gst_no.toUpperCase().replace(/\s/g, "")
      const gstExists = allVendors.some((v: any) => {
        const vGst = (v.gst_no || "").toUpperCase().replace(/\s/g, "")
        return vGst === gstValue && vGst !== ""
      })
      if (gstExists) {
        throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "GST number already exists")
      }
    }

    // Check store name
    if (input.store_name) {
      const storeNameValue = input.store_name.trim()
      const storeNameExists = allVendors.some((v: any) => {
        const vStoreName = (v.store_name || "").trim()
        return vStoreName.toLowerCase() === storeNameValue.toLowerCase() && vStoreName !== ""
      })
      if (storeNameExists) {
        throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Store name already exists")
      }
    }

    // Check store phone
    if (input.store_phone) {
      const storePhoneDigits = input.store_phone.replace(/\D/g, "")
      if (storePhoneDigits) {
        const storePhoneExists = allVendors.some((v: any) => {
          const vStorePhone = (v.store_phone || "").replace(/\D/g, "")
          return vStorePhone === storePhoneDigits && vStorePhone !== ""
        })
        if (storePhoneExists) {
          throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Store phone number already exists")
        }
      }
    }
    return await this.createVendors({
      name: input.name,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      email: input.email,
      phone: input.phone ?? null,
      telephone: input.telephone ?? null,

      // Store Information
      store_name: input.store_name ?? null,
      store_phone: input.store_phone ?? null,
      store_address: input.store_address ?? null,
      store_country: input.store_country ?? null,
      store_region: input.store_region ?? null,
      store_city: input.store_city ?? null,
      store_pincode: input.store_pincode ?? null,
      store_logo: input.store_logo ?? null,
      store_banner: input.store_banner ?? null,
      shipping_policy: input.shipping_policy ?? null,
      return_policy: input.return_policy ?? null,
      whatsapp_number: input.whatsapp_number ?? null,

      // Tax & Legal Information
      pan_gst: input.pan_gst ?? null,
      gst_no: input.gst_no ?? null,
      pan_no: input.pan_no ?? null,

      // Banking Information
      bank_name: input.bank_name ?? null,
      account_no: input.account_no ?? null,
      ifsc_code: input.ifsc_code ?? null,
      cancel_cheque_url: input.cancel_cheque_url ?? null,

      // Documents
      documents: (input.documents ?? null) as any,

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

  async rejectVendor(vendorId: string, rejectionReason: string, adminId?: string | null) {
    const vendors = await this.listVendors({ id: vendorId })
    
    if (!vendors || vendors.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`)
    }

    const vendor = vendors[0]

    console.log("Service: Rejecting vendor with reason")

    // Update vendor with rejection details
    const updated = await this.updateVendors({
      id: vendorId,
      is_approved: false,
      rejection_reason: rejectionReason,
      rejected_at: new Date(),
      rejected_by: adminId || null,
    })

    console.log("Service: Vendor rejected successfully")
    return updated
  }


  async reapplyVendor(vendorId: string, updates: {
    // Personal Information
    name?: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    telephone?: string | null

    // Store Information
    store_name?: string | null
    store_phone?: string | null
    store_address?: string | null
    store_country?: string | null
    store_region?: string | null
    store_city?: string | null
    store_pincode?: string | null
    store_logo?: string | null
    store_banner?: string | null
    shipping_policy?: string | null
    return_policy?: string | null
    whatsapp_number?: string | null

    // Tax & Legal Information
    pan_gst?: string | null
    gst_no?: string | null
    pan_no?: string | null

    // Banking Information
    bank_name?: string | null
    account_no?: string | null
    ifsc_code?: string | null
    cancel_cheque_url?: string | null

    // Documents
    documents?: Array<{ key: string; url: string; name?: string; type?: string }> | null
  }) {
    const vendors = await this.listVendors({ id: vendorId })
    
    if (!vendors || vendors.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`)
    }

    const vendor = vendors[0]

    // Only allow reapply if vendor is rejected
    if (!vendor.rejected_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Vendor is not rejected. Cannot reapply.")
    }

    console.log("Service: Vendor reapplying with updates")

    // Map camelCase to snake_case for database fields
    const dbUpdates: any = {
      id: vendorId,
      is_approved: false,
      rejection_reason: null, // Clear rejection reason
      rejected_at: null, // Clear rejection timestamp
      rejected_by: null, // Clear rejected_by
    }

    // Map fields
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName
    if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone
    if (updates.telephone !== undefined) dbUpdates.telephone = updates.telephone
    
    if (updates.store_name !== undefined) dbUpdates.store_name = updates.store_name
    if (updates.store_phone !== undefined) dbUpdates.store_phone = updates.store_phone
    if (updates.store_address !== undefined) dbUpdates.store_address = updates.store_address
    if (updates.store_country !== undefined) dbUpdates.store_country = updates.store_country
    if (updates.store_region !== undefined) dbUpdates.store_region = updates.store_region
    if (updates.store_city !== undefined) dbUpdates.store_city = updates.store_city
    if (updates.store_pincode !== undefined) dbUpdates.store_pincode = updates.store_pincode
    if (updates.store_logo !== undefined) dbUpdates.store_logo = updates.store_logo
    if (updates.store_banner !== undefined) dbUpdates.store_banner = updates.store_banner
    if (updates.shipping_policy !== undefined) dbUpdates.shipping_policy = updates.shipping_policy
    if (updates.return_policy !== undefined) dbUpdates.return_policy = updates.return_policy
    if (updates.whatsapp_number !== undefined) dbUpdates.whatsapp_number = updates.whatsapp_number
    
    if (updates.pan_gst !== undefined) dbUpdates.pan_gst = updates.pan_gst
    if (updates.gst_no !== undefined) dbUpdates.gst_no = updates.gst_no
    if (updates.pan_no !== undefined) dbUpdates.pan_no = updates.pan_no
    
    if (updates.bank_name !== undefined) dbUpdates.bank_name = updates.bank_name
    if (updates.account_no !== undefined) dbUpdates.account_no = updates.account_no
    if (updates.ifsc_code !== undefined) dbUpdates.ifsc_code = updates.ifsc_code
    if (updates.cancel_cheque_url !== undefined) dbUpdates.cancel_cheque_url = updates.cancel_cheque_url
    
    if (updates.documents !== undefined) dbUpdates.documents = updates.documents

    // Update vendor with new data and reset rejection status (go back to pending)
    const updated = await this.updateVendors(dbUpdates)

    console.log("Service: Vendor reapply successful, status reset to pending")
    return updated
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