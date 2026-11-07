import { MedusaService } from "@medusajs/framework/utils"
import WhatsappNotificationLog from "./models/notification-log"

// Atomic claiming is implemented in the Interakt outbox using the shared PG pool.
export default class WhatsappNotificationModuleService extends MedusaService({ WhatsappNotificationLog }) {}
