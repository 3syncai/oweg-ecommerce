import { hasPasswordResetMailerConfig } from "./password-reset/config"
import { sendTransactionalEmail } from "./password-reset/mailer"

export type ReplacementMailOption = {
  product_title: string
  variant_title: string
  store_name: string
  unit_price: number
  options: Record<string, string>
}

export async function sendVendorReplacementRequestEmail(input: {
  to: string
  orderId: string
  displayId?: string | number | null
  originalTitle: string
  originalPrice: number
  options: ReplacementMailOption[]
  note?: string | null
  expiresAt?: string | null
}) {
  if (!hasPasswordResetMailerConfig()) {
    throw new Error("Customer email is not configured. The request was saved; send the order link manually.")
  }
  const storefront = (
    process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "")
  const orderUrl = `${storefront}/account/orders/${encodeURIComponent(input.orderId)}`
  const label = input.displayId ? `#${input.displayId}` : input.orderId
  const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
  const choices = input.options.map((option) => {
    const attributes = Object.entries(option.options).map(([name, value]) => `${name}: ${value}`).join(", ")
    return `${option.product_title} (${attributes || option.variant_title}) from ${option.store_name} — ${money(option.unit_price)} per item`
  })

  await sendTransactionalEmail({
    to: input.to,
    subject: `Choose an alternative for OWEG order ${label}`,
    heading: `An item in order ${label} needs your choice`,
    intro: `${input.originalTitle} is unavailable from the assigned vendor. The item in your order was ${money(input.originalPrice)}. Your order remains open while we wait for your decision.`,
    paragraphs: [
      ...choices,
      ...(input.note ? [`OWEG note: ${input.note}`] : []),
      `Review and accept or reject an option in your order: ${orderUrl}`,
      ...(input.expiresAt ? [`Please respond by ${new Date(input.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.`] : []),
      "If you prefer, contact OWEG support. An admin can record your decision after speaking with you.",
    ],
    previewText: `Choose an alternative for order ${label}`,
  })
  return { sent: true, orderUrl }
}

export async function sendVendorReplacementDecisionEmail(input: {
  to: string
  orderId: string
  title: string
  decision: "accept" | "reject"
  variant?: string | null
  unitPrice?: number | null
  contactMethod: string
}) {
  if (!hasPasswordResetMailerConfig()) throw new Error("Customer email is not configured")
  const storefront = (process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
  await sendTransactionalEmail({
    to: input.to,
    subject: `Your recorded choice for OWEG order ${input.orderId}`,
    heading: "Your replacement choice was recorded",
    intro: input.decision === "reject"
      ? `OWEG recorded that you declined the proposed replacement for ${input.title}.`
      : `OWEG recorded that you accepted ${input.variant || input.title} at ₹${Number(input.unitPrice || 0).toLocaleString("en-IN")} per item.`,
    paragraphs: [
      `Your decision was recorded after contact by ${input.contactMethod.replace(/_/g, " ")}.`,
      `Review the order and any pending payment adjustment: ${storefront}/account/orders/${encodeURIComponent(input.orderId)}`,
      "If this does not match your decision, contact OWEG support immediately.",
    ],
  })
}

export async function sendVendorReplacementConsentCodeEmail(input: {
  to: string
  orderId: string
  code: string
  variant: string
  storeName: string
  unitPrice: number
  expiresInMinutes: number
}) {
  if (!hasPasswordResetMailerConfig()) throw new Error("Customer email is not configured")
  await sendTransactionalEmail({
    to: input.to,
    subject: `OWEG replacement confirmation code for order ${input.orderId}`,
    heading: "Confirm your replacement choice",
    intro: `An OWEG agent is recording your choice of ${input.variant} from ${input.storeName} at ₹${input.unitPrice.toLocaleString("en-IN")} per item.`,
    paragraphs: [
      `Your confirmation code is ${input.code}. It expires in ${input.expiresInMinutes} minutes. Share it only with the OWEG agent you are speaking with.`,
      "Only provide this code if the replacement and price above match your decision. You can also respond directly in your account instead.",
    ],
  })
}
