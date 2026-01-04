import VendorModuleService from "./service"
import { Module } from "@medusajs/framework/utils"
import Payout from "./models/payout"

export const VENDOR_MODULE = "vendor"

export default Module(VENDOR_MODULE, {
  service: VendorModuleService,
})

export * from "./models/payout"
