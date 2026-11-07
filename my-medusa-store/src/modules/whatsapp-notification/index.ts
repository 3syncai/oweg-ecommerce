import { Module } from "@medusajs/framework/utils"
import WhatsappNotificationModuleService from "./service"

export const WHATSAPP_NOTIFICATION_MODULE = "whatsappNotification"
export default Module(WHATSAPP_NOTIFICATION_MODULE, { service: WhatsappNotificationModuleService })
