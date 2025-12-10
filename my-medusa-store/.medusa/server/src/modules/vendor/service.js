"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const vendor_1 = __importDefault(require("./models/vendor"));
const vendor_user_1 = __importDefault(require("./models/vendor-user"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class VendorModuleService extends (0, utils_1.MedusaService)({
    Vendor: vendor_1.default,
    VendorUser: vendor_user_1.default,
}) {
    async createPendingVendor(input) {
        // Check for duplicates
        const allVendors = await this.listVendors({});
        // Check email
        const emailExists = allVendors.some((v) => v.email?.toLowerCase() === input.email.toLowerCase());
        if (emailExists) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "Email already exists");
        }
        // Check phone/telephone (normalize by removing non-digits)
        if (input.phone || input.telephone) {
            const phoneDigits = (input.phone || input.telephone || "").replace(/\D/g, "");
            if (phoneDigits) {
                const phoneExists = allVendors.some((v) => {
                    const vPhone = (v.phone || "").replace(/\D/g, "");
                    const vTelephone = (v.telephone || "").replace(/\D/g, "");
                    return vPhone === phoneDigits || vTelephone === phoneDigits;
                });
                if (phoneExists) {
                    throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "Phone number already exists");
                }
            }
        }
        // Check PAN number
        if (input.pan_no) {
            const panValue = input.pan_no.toUpperCase().replace(/\s/g, "");
            const panExists = allVendors.some((v) => {
                const vPan = (v.pan_no || "").toUpperCase().replace(/\s/g, "");
                return vPan === panValue && vPan !== "";
            });
            if (panExists) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "PAN number already exists");
            }
        }
        // Check GST number
        if (input.gst_no) {
            const gstValue = input.gst_no.toUpperCase().replace(/\s/g, "");
            const gstExists = allVendors.some((v) => {
                const vGst = (v.gst_no || "").toUpperCase().replace(/\s/g, "");
                return vGst === gstValue && vGst !== "";
            });
            if (gstExists) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "GST number already exists");
            }
        }
        // Check store name
        if (input.store_name) {
            const storeNameValue = input.store_name.trim();
            const storeNameExists = allVendors.some((v) => {
                const vStoreName = (v.store_name || "").trim();
                return vStoreName.toLowerCase() === storeNameValue.toLowerCase() && vStoreName !== "";
            });
            if (storeNameExists) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "Store name already exists");
            }
        }
        // Check store phone
        if (input.store_phone) {
            const storePhoneDigits = input.store_phone.replace(/\D/g, "");
            if (storePhoneDigits) {
                const storePhoneExists = allVendors.some((v) => {
                    const vStorePhone = (v.store_phone || "").replace(/\D/g, "");
                    return vStorePhone === storePhoneDigits && vStorePhone !== "";
                });
                if (storePhoneExists) {
                    throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "Store phone number already exists");
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
            documents: (input.documents ?? null),
            is_approved: false,
        });
    }
    async approveVendor(vendorId, adminId) {
        // Validate the ID
        if (!vendorId || typeof vendorId !== 'string' || vendorId.trim() === '') {
            console.error("Invalid vendorId received:", vendorId);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Valid vendor ID is required");
        }
        console.log("Service: Retrieving vendor with ID:", vendorId);
        // Get vendor
        const vendors = await this.listVendors({ id: vendorId });
        if (!vendors || vendors.length === 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`);
        }
        const vendor = vendors[0];
        if (vendor.is_approved) {
            console.log("Vendor already approved");
            return vendor;
        }
        console.log("Service: Updating vendor approval status");
        // CRITICAL FIX: Use correct Medusa v2 updateVendors signature
        // The first parameter should be an object with id + update data
        const updated = await this.updateVendors({
            id: vendorId,
            is_approved: true,
            approved_at: new Date(),
            approved_by: adminId || null,
        });
        console.log("Service: Vendor approved successfully");
        // Auto-create vendor_user if it doesn't exist
        try {
            const existingUsers = await this.listVendorUsers({ vendor_id: vendorId });
            if (!existingUsers || existingUsers.length === 0) {
                // Generate a temporary password
                const tempPassword = `Temp${Math.random().toString(36).slice(-8)}!`;
                await this.createVendorUser({
                    email: vendor.email,
                    password: tempPassword,
                    vendor_id: vendorId,
                });
                // Set must_reset_password to true
                const newUser = await this.listVendorUsers({ vendor_id: vendorId });
                if (newUser && newUser.length > 0) {
                    await this.updateVendorUsers({
                        id: newUser[0].id,
                        must_reset_password: true,
                    });
                }
                console.log("Auto-created vendor_user with temp password");
            }
        }
        catch (e) {
            console.log("Vendor user creation skipped:", e);
        }
        // Try marketplace integration (only if enabled)
        if (process.env.MARKETPLACE_INTEGRATION === "true") {
            try {
                const container = this.__container__ || this.container;
                if (container && container.resolve) {
                    const marketplace = container.resolve("marketplaceService");
                    if (marketplace && marketplace.createSeller) {
                        const seller = await marketplace.createSeller({
                            email: vendor.email,
                            name: vendor.name,
                            phone: vendor.phone,
                            store_name: vendor.store_name,
                            tax_id: vendor.pan_gst,
                            metadata: { vendor_id: vendorId },
                        });
                        const sellerId = seller?.id || seller;
                        if (sellerId) {
                            await this.updateVendors({
                                id: vendorId,
                                marketplace_seller_id: sellerId
                            });
                        }
                    }
                }
            }
            catch (e) {
                console.log("Marketplace integration skipped:", e);
            }
        }
        return updated;
    }
    async ensureApproved(vendorId) {
        const vendors = await this.listVendors({ id: vendorId });
        if (!vendors || vendors.length === 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, "Vendor not found");
        }
        const vendor = vendors[0];
        if (!vendor.is_approved) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Vendor not approved");
        }
        return vendor;
    }
    async rejectVendor(vendorId, rejectionReason, adminId) {
        const vendors = await this.listVendors({ id: vendorId });
        if (!vendors || vendors.length === 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`);
        }
        const vendor = vendors[0];
        console.log("Service: Rejecting vendor with reason");
        // Update vendor with rejection details
        const updated = await this.updateVendors({
            id: vendorId,
            is_approved: false,
            rejection_reason: rejectionReason,
            rejected_at: new Date(),
            rejected_by: adminId || null,
        });
        console.log("Service: Vendor rejected successfully");
        return updated;
    }
    async reapplyVendor(vendorId, updates) {
        const vendors = await this.listVendors({ id: vendorId });
        if (!vendors || vendors.length === 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Vendor with id "${vendorId}" not found`);
        }
        const vendor = vendors[0];
        // Only allow reapply if vendor is rejected
        if (!vendor.rejected_at) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Vendor is not rejected. Cannot reapply.");
        }
        console.log("Service: Vendor reapplying with updates");
        // Map camelCase to snake_case for database fields
        const dbUpdates = {
            id: vendorId,
            is_approved: false,
            rejection_reason: null, // Clear rejection reason
            rejected_at: null, // Clear rejection timestamp
            rejected_by: null, // Clear rejected_by
        };
        // Map fields
        if (updates.name !== undefined)
            dbUpdates.name = updates.name;
        if (updates.firstName !== undefined)
            dbUpdates.first_name = updates.firstName;
        if (updates.lastName !== undefined)
            dbUpdates.last_name = updates.lastName;
        if (updates.phone !== undefined)
            dbUpdates.phone = updates.phone;
        if (updates.telephone !== undefined)
            dbUpdates.telephone = updates.telephone;
        if (updates.store_name !== undefined)
            dbUpdates.store_name = updates.store_name;
        if (updates.store_phone !== undefined)
            dbUpdates.store_phone = updates.store_phone;
        if (updates.store_address !== undefined)
            dbUpdates.store_address = updates.store_address;
        if (updates.store_country !== undefined)
            dbUpdates.store_country = updates.store_country;
        if (updates.store_region !== undefined)
            dbUpdates.store_region = updates.store_region;
        if (updates.store_city !== undefined)
            dbUpdates.store_city = updates.store_city;
        if (updates.store_pincode !== undefined)
            dbUpdates.store_pincode = updates.store_pincode;
        if (updates.store_logo !== undefined)
            dbUpdates.store_logo = updates.store_logo;
        if (updates.store_banner !== undefined)
            dbUpdates.store_banner = updates.store_banner;
        if (updates.shipping_policy !== undefined)
            dbUpdates.shipping_policy = updates.shipping_policy;
        if (updates.return_policy !== undefined)
            dbUpdates.return_policy = updates.return_policy;
        if (updates.whatsapp_number !== undefined)
            dbUpdates.whatsapp_number = updates.whatsapp_number;
        if (updates.pan_gst !== undefined)
            dbUpdates.pan_gst = updates.pan_gst;
        if (updates.gst_no !== undefined)
            dbUpdates.gst_no = updates.gst_no;
        if (updates.pan_no !== undefined)
            dbUpdates.pan_no = updates.pan_no;
        if (updates.bank_name !== undefined)
            dbUpdates.bank_name = updates.bank_name;
        if (updates.account_no !== undefined)
            dbUpdates.account_no = updates.account_no;
        if (updates.ifsc_code !== undefined)
            dbUpdates.ifsc_code = updates.ifsc_code;
        if (updates.cancel_cheque_url !== undefined)
            dbUpdates.cancel_cheque_url = updates.cancel_cheque_url;
        if (updates.documents !== undefined)
            dbUpdates.documents = updates.documents;
        // Update vendor with new data and reset rejection status (go back to pending)
        const updated = await this.updateVendors(dbUpdates);
        console.log("Service: Vendor reapply successful, status reset to pending");
        return updated;
    }
    async createVendorUser(input) {
        const existing = await this.listVendorUsers({ email: input.email });
        if (existing && existing.length > 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.DUPLICATE_ERROR, "Vendor user with email already exists");
        }
        const password_hash = await bcryptjs_1.default.hash(input.password, 10);
        return await this.createVendorUsers({
            email: input.email,
            password_hash,
            vendor_id: input.vendor_id,
        });
    }
    async authenticateVendorUser(email, password) {
        const users = await this.listVendorUsers({ email });
        if (!users || users.length === 0) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNAUTHORIZED, "Invalid credentials");
        }
        const user = users[0];
        const ok = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!ok) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNAUTHORIZED, "Invalid credentials");
        }
        // Update last login
        await this.updateVendorUsers({
            id: user.id,
            last_login_at: new Date()
        });
        return user;
    }
}
exports.default = VendorModuleService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL3ZlbmRvci9zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEscURBQXNFO0FBQ3RFLDZEQUFvQztBQUNwQyx1RUFBNkM7QUFDN0Msd0RBQTZCO0FBRTdCLE1BQU0sbUJBQW9CLFNBQVEsSUFBQSxxQkFBYSxFQUFDO0lBQzlDLE1BQU0sRUFBTixnQkFBTTtJQUNOLFVBQVUsRUFBVixxQkFBVTtDQUNYLENBQUM7SUFDQSxLQUFLLENBQUMsbUJBQW1CLENBQUMsS0FvQ3pCO1FBQ0MsdUJBQXVCO1FBQ3ZCLE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUU3QyxjQUFjO1FBQ2QsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUE7UUFDckcsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsc0JBQXNCLENBQUMsQ0FBQTtRQUNsRixDQUFDO1FBRUQsMkRBQTJEO1FBQzNELElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbkMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQTtZQUM3RSxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNoQixNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFD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QUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUE7UUFDckYsSUFBSSxPQUFPLENBQUMsVUFBVSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUE7UUFDL0UsSUFBSSxPQUFPLENBQUMsYUFBYSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDeEYsSUFBSSxPQUFPLENBQUMsVUFBVSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUE7UUFDL0UsSUFBSSxPQUFPLENBQUMsWUFBWSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUE7UUFDckYsSUFBSSxPQUFPLENBQUMsZUFBZSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsZUFBZSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUE7UUFDOUYsSUFBSSxPQUFPLENBQUMsYUFBYSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDeEYsSUFBSSxPQUFPLENBQUMsZUFBZSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsZUFBZSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUE7UUFFOUYsSUFBSSxPQUFPLENBQUMsT0FBTyxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUE7UUFDdEUsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUE7UUFDbkUsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUE7UUFFbkUsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLFNBQVM7WUFBRSxTQUFTLENBQUMsU0FBUyxH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