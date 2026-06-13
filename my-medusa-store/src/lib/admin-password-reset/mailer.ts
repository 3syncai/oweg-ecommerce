import { hasPasswordResetMailerConfig } from "../password-reset/config"
import { sendPasswordResetEmail } from "../password-reset/mailer"
import { normalizeEmail } from "../password-reset/crypto"

type SendAdminResetMailInput = {
  to: string
  resetUrl: string
  expiresInMinutes: number
}

export async function sendAdminPasswordResetEmail(input: SendAdminResetMailInput) {
  if (!hasPasswordResetMailerConfig()) {
    throw new Error("SMTP configuration is incomplete")
  }

  const to = normalizeEmail(input.to)
  if (!to) {
    throw new Error("Invalid admin email address")
  }

  await sendPasswordResetEmail({
    to,
    resetUrl: input.resetUrl,
    expiresInMinutes: input.expiresInMinutes,
    subject: "Reset your OWEG Admin password",
    heading: "Reset your admin password",
    intro:
      "We received a request to reset your OWEG Admin password. Use the button below to choose a new password.",
    buttonLabel: "Reset Admin Password",
  })
}
