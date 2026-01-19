import ReturnModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const RETURN_MODULE = "returns"

export default Module(RETURN_MODULE, {
  service: ReturnModuleService,
})
