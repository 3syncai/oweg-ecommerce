"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = orderPlacedSubscriber;
const utils_1 = require("@medusajs/framework/utils");
const invoice_generator_1 = require("../services/invoice-generator");
async function orderPlacedSubscriber({ event: { data }, container, }) {
    const notificationModuleService = container.resolve(utils_1.Modules.NOTIFICATION);
    const orderModuleService = container.resolve(utils_1.Modules.ORDER);
    const orderId = data.id;
    // 1. Fetch Order Details
    const order = await orderModuleService.retrieveOrder(orderId, {
        relations: ["items", "shipping_address", "billing_address", "currency"],
    });
    // 2. Generate Invoice
    let invoicePdfBuffer = null;
    try {
        invoicePdfBuffer = await (0, invoice_generator_1.generateInvoice)(order);
    }
    catch (err) {
        console.error("Failed to generate invoice PDF:", err);
    }
    if (!order.email) {
        return;
    }
    const attachments = [];
    if (invoicePdfBuffer) {
        attachments.push({
            filename: `Invoice-${order.display_id}.pdf`,
            content: invoicePdfBuffer,
        });
    }
    // 3. Send Notification
    await notificationModuleService.createNotifications({
        to: order.email,
        channel: "email",
        template: "order-confirmation",
        data: {
            subject: `Order Confirmation #${order.display_id}`,
            order: order,
            text: `Thank you for your order! Order ID: ${order.display_id}. Find your invoice attached.`,
            html: `<h1>Thank you for your order!</h1><p>Order ID: ${order.display_id}</p><p>Your invoice is attached.</p>`,
            attachments: attachments
        }
    });
    console.log(`Notification sent for order ${orderId}`);
}
exports.config = {
    event: "order.placed",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItcGxhY2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL29yZGVyLXBsYWNlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSx3Q0FpREM7QUFwREQscURBQW1EO0FBQ25ELHFFQUErRDtBQUVoRCxLQUFLLFVBQVUscUJBQXFCLENBQUMsRUFDbEQsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQ2YsU0FBUyxHQUNzQjtJQUMvQixNQUFNLHlCQUF5QixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLFlBQVksQ0FBQyxDQUFBO0lBQ3pFLE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsS0FBSyxDQUFDLENBQUE7SUFFM0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQTtJQUV2Qix5QkFBeUI7SUFDekIsTUFBTSxLQUFLLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFO1FBQzVELFNBQVMsRUFBRSxDQUFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLENBQUM7S0FDeEUsQ0FBQyxDQUFBO0lBRUYsc0JBQXNCO0lBQ3RCLElBQUksZ0JBQWdCLEdBQWtCLElBQUksQ0FBQTtJQUMxQyxJQUFJLENBQUM7UUFDSCxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsbUNBQWUsRUFBQyxLQUFLLENBQUMsQ0FBQTtJQUNqRCxDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDdkQsQ0FBQztJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakIsT0FBTTtJQUNSLENBQUM7SUFFRCxNQUFNLFdBQVcsR0FBVSxFQUFFLENBQUE7SUFDN0IsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3JCLFdBQVcsQ0FBQyxJQUFJLENBQUM7WUFDZixRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUMsVUFBVSxNQUFNO1lBQzNDLE9BQU8sRUFBRSxnQkFBZ0I7U0FDMUIsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUVELHVCQUF1QjtJQUN2QixNQUFNLHlCQUF5QixDQUFDLG1CQUFtQixDQUFDO1FBQ2xELEVBQUUsRUFBRSxLQUFLLENBQUMsS0FBSztRQUNmLE9BQU8sRUFBRSxPQUFPO1FBQ2hCLFFBQVEsRUFBRSxvQkFBb0I7UUFDOUIsSUFBSSxFQUFFO1lBQ0osT0FBTyxFQUFFLHVCQUF1QixLQUFLLENBQUMsVUFBVSxFQUFFO1lBQ2xELEtBQUssRUFBRSxLQUFLO1lBQ1osSUFBSSxFQUFFLHVDQUF1QyxLQUFLLENBQUMsVUFBVSwrQkFBK0I7WUFDNUYsSUFBSSxFQUFFLGtEQUFrRCxLQUFLLENBQUMsVUFBVSxzQ0FBc0M7WUFDOUcsV0FBVyxFQUFFLFdBQVc7U0FDekI7S0FDRixDQUFDLENBQUE7SUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixPQUFPLEVBQUUsQ0FBQyxDQUFBO0FBQ3ZELENBQUM7QUFFWSxRQUFBLE1BQU0sR0FBcUI7SUFDdEMsS0FBSyxFQUFFLGNBQWM7Q0FDdEIsQ0FBQSJ9