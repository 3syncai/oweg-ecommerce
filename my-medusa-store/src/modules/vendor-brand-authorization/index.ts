import VendorBrandAuthorizationModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const VENDOR_BRAND_AUTHORIZATION_MODULE = "vendorBrandAuthorization"

export default Module(VENDOR_BRAND_AUTHORIZATION_MODULE, {
    service: VendorBrandAuthorizationModuleService,
})
