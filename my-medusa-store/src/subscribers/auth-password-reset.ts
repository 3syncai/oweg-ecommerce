import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { buildAdminResetUrl } from "../lib/admin-password-reset/config"
import { sendAdminPasswordResetEmail } from "../lib/admin-password-reset/mailer"
import { hasPasswordResetMailerConfig } from "../lib/password-reset/config"
import { normalizeEmail } from "../lib/password-reset/crypto"

type AuthPasswordResetPayload = {
  entity_id: string
  actor_type: string
  token: string
}

export default async function authPasswordResetSubscriber({
  event: { data },
}: SubscriberArgs<AuthPasswordResetPayload>) {
  if (data.actor_type !== "user") {
    return
  }

  const email = normalizeEmail(data.entity_id)
  if (!email || !data.token) {
    return
  }

  if (!hasPasswordResetMailerConfig()) {
    console.error(
      "[auth.password_reset] SMTP is not configured. Admin reset email was not sent."
    )
    return
  }

  const resetUrl = buildAdminResetUrl(data.token)
  if (!resetUrl) {
    console.error(
      "[auth.password_reset] ADMIN_URL is not configured. Admin reset email was not sent."
    )
    return
  }

  try {
    await sendAdminPasswordResetEmail({
      to: email,
      resetUrl,
      expiresInMinutes: 15,
    })
  } catch (error) {
    console.error("[auth.password_reset] Failed to send admin reset email:", error)
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
