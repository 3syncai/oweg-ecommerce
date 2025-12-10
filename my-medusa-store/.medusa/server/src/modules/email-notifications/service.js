"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
// @ts-ignore
const resend_1 = require("resend");
class ResendNotificationProviderService extends utils_1.AbstractNotificationProviderService {
    constructor(container, options) {
        super();
        if (!options.apiKey) {
            throw new Error("RESEND_API_KEY is required for ResendNotificationProviderService");
        }
        if (!options.from) {
            throw new Error("RESEND_FROM is required for ResendNotificationProviderService");
        }
        this.options = options;
        this.resend = new resend_1.Resend(options.apiKey);
    }
    async send(notification) {
        // The 'notification' object contains 'to', 'template', 'data', etc.
        // We map this to Resend's API.
        if (!notification.to) {
            throw new Error("No 'to' address provided for notification");
        }
        try {
            const emailOptions = {
                from: this.options.from,
                to: notification.to,
                subject: notification.data?.subject || "Order Notification",
                html: notification.data?.html || "<p>No content provided</p>",
                attachments: notification.data?.attachments || [],
            };
            // If text content is provided
            if (notification.data?.text) {
                emailOptions.text = notification.data.text;
            }
            const { data, error } = await this.resend.emails.send(emailOptions);
            if (error) {
                console.error("Resend Error:", error);
                throw new Error(`Failed to send email via Resend: ${error.message}`);
            }
            console.log("Email sent successfully:", data);
            return data;
        }
        catch (error) {
            console.error("Resend Service Error:", error);
            throw error;
        }
    }
}
ResendNotificationProviderService.identifier = "resend-notification";
exports.default = ResendNotificationProviderService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2VtYWlsLW5vdGlmaWNhdGlvbnMvc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHFEQUErRTtBQUMvRSxhQUFhO0FBQ2IsbUNBQStCO0FBVy9CLE1BQXFCLGlDQUFrQyxTQUFRLDJDQUFtQztJQUtoRyxZQUFZLFNBQStCLEVBQUUsT0FBc0I7UUFDakUsS0FBSyxFQUFFLENBQUE7UUFDUCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsa0VBQWtFLENBQUMsQ0FBQTtRQUN0RixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLCtEQUErRCxDQUFDLENBQUE7UUFDbkYsQ0FBQztRQUNELElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFBO1FBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxlQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzFDLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQWlCO1FBQzFCLG9FQUFvRTtRQUNwRSwrQkFBK0I7UUFFL0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLDJDQUEyQyxDQUFDLENBQUE7UUFDOUQsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sWUFBWSxHQUFRO2dCQUN4QixJQUFJLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJO2dCQUN2QixFQUFFLEVBQUUsWUFBWSxDQUFDLEVBQUU7Z0JBQ25CLE9BQU8sRUFBRSxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sSUFBSSxvQkFBb0I7Z0JBQzNELElBQUksRUFBRSxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSSw0QkFBNEI7Z0JBQzdELFdBQVcsRUFBRSxZQUFZLENBQUMsSUFBSSxFQUFFLFdBQVcsSUFBSSxFQUFFO2FBQ2xELENBQUE7WUFFRCw4QkFBOEI7WUFDOUIsSUFBSSxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO2dCQUM1QixZQUFZLENBQUMsSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFBO1lBQzVDLENBQUM7WUFFRCxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFBO1lBRW5FLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1YsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUE7Z0JBQ3JDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFBO1lBQ3RFLENBQUM7WUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLElBQUksQ0FBQyxDQUFBO1lBQzdDLE9BQU8sSUFBSSxDQUFBO1FBQ2IsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFBO1lBQzdDLE1BQU0sS0FBSyxDQUFBO1FBQ2QsQ0FBQztJQUNILENBQUM7O0FBbkRNLDRDQUFVLEdBQUcscUJBQXFCLENBQUE7a0JBRHRCLGlDQUFpQyJ9