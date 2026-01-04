import FlashSaleModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const FLASH_SALE_MODULE = "flashSale"

export default Module(FLASH_SALE_MODULE, {
  service: FlashSaleModuleService,
})

