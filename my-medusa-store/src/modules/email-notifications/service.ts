import { RequiredEntityData } from "@medusajs/framework/types"
import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
// @ts-ignore
import { Resend } from "resend"

type ResendOptions = {
  apiKey: string
  from: string
}

type InjectedDependencies = {
  // Add dependencies if needed
}

export default class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend-notification"
  protected resend: any
  protected options: ResendOptions

  constructor(container: InjectedDependencies, options: ResendOptions) {
    super(container)
    this.options = options
    this.resend = new Resend(options.apiKey)
  }

  async send(notification: any): Promise<void> {
    // The 'notification' object contains 'to', 'template', 'data', etc.
    // We map this to Resend's API.
    
    if (!notification.to) {
      throw new Error("No 'to' address provided for notification")
    }

    try {
      const emailOptions: any = {
        from: this.options.from,
        to: notification.to,
        subject: notification.data?.subject || "Order Notification",
        html: notification.data?.html || "<p>No content provided</p>", 
        attachments: notification.data?.attachments || [],
      }

      // If text content is provided
      if (notification.data?.text) {
        emailOptions.text = notification.data.text
      }

      const { data, error } = await this.resend.emails.send(emailOptions)

      if (error) {
        console.error("Resend Error:", error)
        throw new Error(`Failed to send email via Resend: ${error.message}`)
      }

      console.log("Email sent successfully:", data)
      return data
    } catch (error) {
       console.error("Resend Service Error:", error)
       throw error
    }
  }
}
