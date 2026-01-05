import { MedusaService } from "@medusajs/framework/utils"
import VendorBrandAuthorization from "./models/brand-authorization"

class VendorBrandAuthorizationModuleService extends MedusaService({
    VendorBrandAuthorization,
}) {
    /**
     * Check if a vendor has authorization for a specific brand
     */
    async checkBrandAuthorization(
        vendorId: string,
        brandName: string
    ): Promise<boolean> {
        const normalizedBrand = this.normalizeBrandName(brandName)

        const authorization = await this.listVendorBrandAuthorizations({
            vendor_id: vendorId,
            brand_name: normalizedBrand,
        })

        return authorization.length > 0
    }

    /**
     * Get brand authorization details
     */
    async getBrandAuthorization(
        vendorId: string,
        brandName: string
    ) {
        const normalizedBrand = this.normalizeBrandName(brandName)

        const authorizations = await this.listVendorBrandAuthorizations({
            vendor_id: vendorId,
            brand_name: normalizedBrand,
        })

        return authorizations[0] || null
    }

    /**
     * Create or update brand authorization
     */
    async upsertBrandAuthorization(data: {
        vendor_id: string
        brand_name: string
        authorization_file_url: string
        authorization_file_key: string
        metadata?: Record<string, any>
    }) {
        const normalizedBrand = this.normalizeBrandName(data.brand_name)

        // Check if authorization already exists
        const existing = await this.getBrandAuthorization(
            data.vendor_id,
            normalizedBrand
        )

        if (existing) {
            // Update existing
            return await this.updateVendorBrandAuthorizations({
                id: existing.id,
                authorization_file_url: data.authorization_file_url,
                authorization_file_key: data.authorization_file_key,
                metadata: data.metadata,
            })
        } else {
            // Create new
            return await this.createVendorBrandAuthorizations({
                vendor_id: data.vendor_id,
                brand_name: normalizedBrand,
                authorization_file_url: data.authorization_file_url,
                authorization_file_key: data.authorization_file_key,
                verified: false,
                metadata: data.metadata,
            })
        }
    }

    /**
     * List all brand authorizations for a vendor
     */
    async listVendorAuthorizations(vendorId: string) {
        return await this.listVendorBrandAuthorizations({
            vendor_id: vendorId,
        })
    }

    /**
     * Verify a brand authorization
     */
    async verifyBrandAuthorization(
        authorizationId: string,
        verifiedBy: string
    ) {
        return await this.updateVendorBrandAuthorizations({
            id: authorizationId,
            verified: true,
            verified_at: new Date(),
            verified_by: verifiedBy,
        })
    }

    /**
     * Normalize brand name for consistent storage and comparison
     */
    private normalizeBrandName(brandName: string): string {
        if (!brandName || brandName.trim() === "") {
            return "UNBRANDED"
        }

        return brandName.trim().toLowerCase()
    }
}

export default VendorBrandAuthorizationModuleService
