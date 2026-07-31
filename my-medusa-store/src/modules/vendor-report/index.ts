import VendorReportModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const VENDOR_REPORT_MODULE = "vendorReport"

export default Module(VENDOR_REPORT_MODULE, {
  service: VendorReportModuleService,
})
