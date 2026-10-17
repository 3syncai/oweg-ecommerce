import { sendTransactionalEmail } from "../password-reset/mailer"

export function adminSiteUrl(): string {
  const url = new URL(process.env.ADMIN_SITE_URL || (process.env.NODE_ENV === "production"
    ? "https://ecomm-admin-ecru.vercel.app/app" : "http://localhost:9000/app"))
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("ADMIN_SITE_URL must be a trusted HTTPS admin address")
  }
  return url.toString().replace(/\/$/, "")
}

export function credentialMessage(input: { email: string; password: string; name?: string; role: string; reset?: boolean; date?: Date }) {
  return {
    to: input.email,
    subject: input.reset ? "Your OWEG Admin credentials have been reset" : "Welcome to OWEG — your admin account is ready",
    heading: input.reset ? "Your temporary admin password" : "Welcome to the OWEG team",
    intro: `Hello ${input.name?.trim() || "there"}, ${input.reset ? "your admin password has been reset" : "your superadmin has created your admin account"}.`,
    paragraphs: [
      `Admin site: ${adminSiteUrl()}`,
      `Login email: ${input.email}`,
      `Temporary password: ${input.password}`,
      `Assigned role: ${input.role}`,
      `${input.reset ? "Reset" : "Created"} on: ${(input.date || new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" })}`,
      "Sign in using these temporary credentials. You must set your own new password before accessing the dashboard.",
      "Keep these credentials private. If you were not expecting this account, contact your superadmin.",
      "We are glad to have you with us. — The OWEG team",
    ],
  }
}

export async function emailAdminCredentials(input: Parameters<typeof credentialMessage>[0]): Promise<"sent" | "failed"> {
  try {
    await sendTransactionalEmail(credentialMessage(input))
    return "sent"
  } catch {
    // Never expose an SMTP response or the temporary password through logs/audit.
    // The account still exists: report a delivery failure instead of encouraging a duplicate creation.
    return "failed"
  }
}
