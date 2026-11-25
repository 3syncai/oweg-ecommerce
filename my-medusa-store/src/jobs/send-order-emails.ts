import type { MedusaRequest } from "@medusajs/framework/http"
import { processOrderEmails } from "../services/order-email/outbox"

export default async function sendOrderEmails(container: MedusaRequest["scope"]) {
  const logger = container.resolve("logger")
  try {
    await processOrderEmails(undefined, undefined, logger)
  } catch {
    logger.warn("[order-email] outbox processing failed; check database and email configuration")
  }
}

export const config = { name: "send-order-emails", schedule: "* * * * *" }
