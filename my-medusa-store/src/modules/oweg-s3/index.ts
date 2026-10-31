import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { OwegS3FileService } from "./service"

export default ModuleProvider(Modules.FILE, { services: [OwegS3FileService] })
