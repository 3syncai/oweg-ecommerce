import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import AffiliateAdmin from "./models/affiliate-admin"
import AffiliateUser from "./models/affiliate-user"
import AffiliateCommission from "./models/affiliate-commission"
import bcrypt from "bcryptjs"

class AffiliateModuleService extends MedusaService({
  AffiliateAdmin,
  AffiliateUser,
  AffiliateCommission,
}) {
  async createAffiliateAdmin(input: {
    name: string
    email: string
    password: string
  }) {
    // Check for duplicate email
    const existing = await this.listAffiliateAdmins({ email: input.email })
    if (existing && existing.length > 0) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Affiliate admin with email already exists")
    }

    // Hash password
    const password_hash = await bcrypt.hash(input.password, 10)

    // Create affiliate admin
    return await this.createAffiliateAdmins({
      name: input.name,
      email: input.email,
      password_hash,
    })
  }

  async authenticateAffiliateAdmin(email: string, password: string, ip?: string) {
    const admins = await this.listAffiliateAdmins({ email })
    if (!admins || admins.length === 0) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }

    const admin = admins[0]
    const ok = await bcrypt.compare(password, admin.password_hash)
    if (!ok) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }

    // Update last login time and IP
    await this.updateAffiliateAdmins({
      id: admin.id,
      last_login_at: new Date(),
      login_ip: ip || null,
    })

    return admin
  }

  async updateAffiliateAdminLogin(adminId: string, ip?: string) {
    await this.updateAffiliateAdmins({
      id: adminId,
      last_login_at: new Date(),
      login_ip: ip || null,
    })
  }

  // Affiliate User methods
  async createAffiliateUser(input: {
    first_name: string
    last_name: string
    email: string
    password: string
    phone?: string | null
    refer_code?: string | null
    entry_sponsor?: string | null
    is_agent?: boolean
    gender?: string | null
    father_name?: string | null
    mother_name?: string | null
    birth_date?: string | null
    qualification?: string | null
    marital_status?: string | null
    blood_group?: string | null
    emergency_person_name?: string | null
    emergency_person_mobile?: string | null
    aadhar_card_no?: string | null
    pan_card_no?: string | null
    aadhar_card_photo?: string | null
    pan_card_photo?: string | null
    designation?: string | null
    sales_target?: string | null
    branch?: string | null
    area?: string | null
    state?: string | null
    payment_method?: string | null
    bank_name?: string | null
    bank_branch?: string | null
    ifsc_code?: string | null
    account_name?: string | null
    account_number?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    pin_code?: string | null
    country?: string | null
    address_state?: string | null
  }) {
    // Check for duplicate email in both admin and user tables
    const existingAdmin = await this.listAffiliateAdmins({ email: input.email })
    const existingUser = await this.listAffiliateUsers({ email: input.email })
    
    if ((existingAdmin && existingAdmin.length > 0) || (existingUser && existingUser.length > 0)) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Email already exists")
    }

    // Hash password
    const password_hash = await bcrypt.hash(input.password, 10)

    // Generate unique referral code: OWEG{USERNAME}{5DIGITRANDOM}
    const generateReferralCode = async (): Promise<string> => {
      // Extract username from first_name, remove non-letters, uppercase, max 10 chars
      let username = input.first_name.toUpperCase().replace(/[^A-Z]/g, '')
      if (username.length === 0) {
        username = "USER"
      } else if (username.length > 10) {
        username = username.substring(0, 10)
      }
      
      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        // Generate 5 random digits (10000-99999)
        const randomDigits = Math.floor(10000 + Math.random() * 90000).toString()
        const referralCode = `OWEG${username}${randomDigits}`

        // Check if code already exists
        const existingUsers = await this.listAffiliateUsers({ refer_code: referralCode })
        
        // Check if any admin has this refer_code (if we add it to admin model later)
        const existingAdmins = await this.listAffiliateAdmins({})
        const codeExists = (existingUsers && existingUsers.length > 0) || 
                          (existingAdmins && existingAdmins.some((a: any) => a.refer_code === referralCode))

        if (!codeExists) {
          return referralCode
        }

        attempts++
      }

      // Fallback: use timestamp if all attempts fail
      const timestamp = Date.now().toString().slice(-5)
      return `OWEG${username}${timestamp}`
    }

    const autoGeneratedReferCode = await generateReferralCode()

    // Parse birth_date if provided
    let birthDate: Date | null = null
    if (input.birth_date) {
      // Handle dd-mm-yyyy format
      const parts = input.birth_date.split('-')
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10) - 1 // Month is 0-indexed
        const year = parseInt(parts[2], 10)
        birthDate = new Date(year, month, day)
      } else {
        birthDate = new Date(input.birth_date)
      }
    }

    // Create affiliate user (pending approval by default)
    // Note: input.refer_code is the referral code they entered (entry_sponsor)
    // autoGeneratedReferCode is their own unique referral code
    return await this.createAffiliateUsers({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      password_hash,
      phone: input.phone || null,
      refer_code: autoGeneratedReferCode, // Auto-generated unique code for this user
      entry_sponsor: input.entry_sponsor || input.refer_code || null, // The referral code they entered (their sponsor's code)
      is_agent: input.is_agent || false,
      is_approved: false,
      gender: input.gender || null,
      father_name: input.father_name || null,
      mother_name: input.mother_name || null,
      birth_date: birthDate,
      qualification: input.qualification || null,
      marital_status: input.marital_status || null,
      blood_group: input.blood_group || null,
      emergency_person_name: input.emergency_person_name || null,
      emergency_person_mobile: input.emergency_person_mobile || null,
      aadhar_card_no: input.aadhar_card_no || null,
      pan_card_no: input.pan_card_no || null,
      aadhar_card_photo: input.aadhar_card_photo || null,
      pan_card_photo: input.pan_card_photo || null,
      designation: input.designation || null,
      sales_target: input.sales_target || null,
      branch: input.branch || null,
      area: input.area || null,
      state: input.state || null,
      payment_method: input.payment_method || null,
      bank_name: input.bank_name || null,
      bank_branch: input.bank_branch || null,
      ifsc_code: input.ifsc_code || null,
      account_name: input.account_name || null,
      account_number: input.account_number || null,
      address_1: input.address_1 || null,
      address_2: input.address_2 || null,
      city: input.city || null,
      pin_code: input.pin_code || null,
      country: input.country || null,
      address_state: input.address_state || null,
    })
  }

  async authenticateAffiliateUser(email: string, password: string, ip?: string) {
    // Try to authenticate as admin first
    const admins = await this.listAffiliateAdmins({ email })
    if (admins && admins.length > 0) {
      const admin = admins[0]
      const ok = await bcrypt.compare(password, admin.password_hash)
      if (ok) {
        // Update last login time and IP
        await this.updateAffiliateAdmins({
          id: admin.id,
          last_login_at: new Date(),
          login_ip: ip || null,
        })
        return { ...admin, role: "admin" }
      }
    }

    // Try to authenticate as regular user
    const users = await this.listAffiliateUsers({ email })
    if (!users || users.length === 0) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }

    const user = users[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Invalid credentials")
    }

    // Update last login time and IP
    await this.updateAffiliateUsers({
      id: user.id,
      last_login_at: new Date(),
      login_ip: ip || null,
    })

    return { ...user, role: "user" }
  }

  async approveAffiliateUser(userId: string, adminId?: string | null) {
    const users = await this.listAffiliateUsers({ id: userId })
    if (!users || users.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Affiliate user with id "${userId}" not found`)
    }

    const user = users[0]
    if (user.is_approved) {
      return user
    }

    const updated = await this.updateAffiliateUsers({
      id: userId,
      is_approved: true,
      approved_at: new Date(),
      approved_by: adminId || null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })

    return updated
  }

  async rejectAffiliateUser(userId: string, rejectionReason: string, adminId?: string | null) {
    const users = await this.listAffiliateUsers({ id: userId })
    if (!users || users.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Affiliate user with id "${userId}" not found`)
    }

    const updated = await this.updateAffiliateUsers({
      id: userId,
      is_approved: false,
      rejection_reason: rejectionReason,
      rejected_at: new Date(),
      rejected_by: adminId || null,
    })

    return updated
  }

  // Commission methods
  async createCommission(input: {
    product_id?: string | null
    category_id?: string | null
    collection_id?: string | null
    type_id?: string | null
    commission_rate: number
    metadata?: any
  }) {
    // Validate that exactly one of product_id, category_id, collection_id, or type_id is set
    const ids = [input.product_id, input.category_id, input.collection_id, input.type_id].filter(Boolean)
    if (ids.length !== 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Exactly one of product_id, category_id, collection_id, or type_id must be provided"
      )
    }

    // Validate commission_rate is between 0 and 100
    if (input.commission_rate < 0 || input.commission_rate > 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Commission rate must be between 0 and 100"
      )
    }

    // Check if commission already exists for this entity
    const existing = await this.listAffiliateCommissions({
      product_id: input.product_id || undefined,
      category_id: input.category_id || undefined,
      collection_id: input.collection_id || undefined,
      type_id: input.type_id || undefined,
    })

    if (existing && existing.length > 0) {
      // Update existing commission instead of creating duplicate
      const existingCommission = existing[0]
      return await this.updateAffiliateCommissions({
        id: existingCommission.id,
        commission_rate: input.commission_rate,
        metadata: input.metadata || existingCommission.metadata,
      })
    }

    return await this.createAffiliateCommissions({
      product_id: input.product_id || null,
      category_id: input.category_id || null,
      collection_id: input.collection_id || null,
      type_id: input.type_id || null,
      commission_rate: input.commission_rate,
      metadata: input.metadata || null,
    })
  }

  async updateCommission(commissionId: string, input: {
    commission_rate?: number
    metadata?: any
  }) {
    const commissions = await this.listAffiliateCommissions({ id: commissionId })
    if (!commissions || commissions.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Commission with id "${commissionId}" not found`)
    }

    // Validate commission_rate if provided
    if (input.commission_rate !== undefined) {
      if (input.commission_rate < 0 || input.commission_rate > 100) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Commission rate must be between 0 and 100"
        )
      }
    }

    return await this.updateAffiliateCommissions({
      id: commissionId,
      commission_rate: input.commission_rate,
      metadata: input.metadata,
    })
  }

  async deleteCommission(commissionId: string) {
    const commissions = await this.listAffiliateCommissions({ id: commissionId })
    if (!commissions || commissions.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Commission with id "${commissionId}" not found`)
    }

    await this.deleteAffiliateCommissions(commissionId)
    return { success: true }
  }
}

export default AffiliateModuleService

