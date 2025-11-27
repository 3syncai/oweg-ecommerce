import VendorModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const VENDOR_MODULE = "vendor"

export default Module(VENDOR_MODULE, {
  service: VendorModuleService,
})


