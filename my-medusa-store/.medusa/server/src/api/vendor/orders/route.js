"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
const guards_1 = require("../_lib/guards");
const utils_1 = require("@medusajs/framework/utils");
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res);
    return res.status(200).end();
}
async function GET(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    try {
        const orderModuleService = req.scope.resolve(utils_1.Modules.ORDER);
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // Get all vendor products
        const allProducts = await productModuleService.listProducts({});
        const vendorProducts = allProducts.filter((p) => {
            const metadata = p.metadata || {};
            return metadata.vendor_id === auth.vendor_id;
        });
        const vendorProductIds = new Set(vendorProducts.map((p) => p.id));
        // List all orders
        const orders = await orderModuleService.listOrders({});
        // Filter orders that contain vendor's products
        const vendorOrders = orders.filter((order) => {
            const items = order.items || [];
            return items.some((item) => {
                const productId = item.product_id || item.variant?.product_id;
                return productId && vendorProductIds.has(productId);
            });
        });
        return res.json({ orders: vendorOrders });
    }
    catch (error) {
        console.error("Vendor orders list error:", error);
        return res.status(500).json({ message: error?.message || "Failed to list orders" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9vcmRlcnMvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFZQSwwQkFHQztBQUVELGtCQWtDQztBQWxERCwyQ0FBc0Q7QUFDdEQscURBQW1EO0FBRW5ELHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQjtJQUN6QyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2pELEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQTtJQUNoRixHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLG9EQUFvRCxDQUFDLENBQUE7SUFDbkcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUMzRCxDQUFDO0FBRU0sS0FBSyxVQUFVLE9BQU8sQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ25FLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDOUIsQ0FBQztBQUVNLEtBQUssVUFBVSxHQUFHLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUMvRCxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFBLDhCQUFxQixFQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNsRCxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU07SUFFakIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDM0QsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFL0QsMEJBQTBCO1FBQzFCLE1BQU0sV0FBVyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQy9ELE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRTtZQUNuRCxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQTtZQUNqQyxPQUFPLFFBQVEsQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLFNBQVMsQ0FBQTtRQUM5QyxDQUFDLENBQUMsQ0FBQTtRQUNGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7UUFFdEUsa0JBQWtCO1FBQ2xCLE1BQU0sTUFBTSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBRXRELCtDQUErQztRQUMvQyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDaEQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUE7WUFDL0IsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUU7Z0JBQzlCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUE7Z0JBQzdELE9BQU8sU0FBUyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQTtZQUNyRCxDQUFDLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUE7SUFDM0MsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUNqRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFBO0lBQ3JGLENBQUM7QUFDSCxDQUFDIn0=