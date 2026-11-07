import { processNotificationOutbox } from "../services/interakt/outbox"
export default async function sendWhatsappNotifications(container: any) {
  try { await processNotificationOutbox(undefined, undefined, container.resolve("logger"), container) }
  catch { container.resolve("logger").warn('[interakt] outbox processing failed; inspect database/configuration') }
}
export const config = { name: "send-whatsapp-notifications", schedule: "* * * * *" }
