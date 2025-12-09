import { Modules } from "@medusajs/framework/utils"

export default async function verifyEmail({ container }: any) {
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  console.log("📡 Attempting to send test email to 'delivered@resend.dev'...")
  
  try {
    const result = await notificationModule.createNotifications({
      to: "delivered@resend.dev", // Resend's test address (always succeeds if keys are valid)
      channel: "email",
      template: "test-template", // Template ID doesn't matter for our custom provider logic which uses 'html' directly
      data: {
        subject: "Test Email from Medusa V2",
        html: "<h1>✅ It Works!</h1><p>Your Medusa V2 email provider is configured correctly.</p>",
        text: "It Works! Your Medusa V2 email provider is configured correctly."
      }
    })
    console.log("✅ SUCCESS: Test email sent successfully!")
    console.log("Response:", JSON.stringify(result, null, 2))
  } catch (error) {
    console.error("❌ FAILED: Could not send email.")
    console.error(error)
  }
}
