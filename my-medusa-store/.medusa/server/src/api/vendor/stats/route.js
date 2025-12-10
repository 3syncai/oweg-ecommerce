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
        // Get vendor products
        const allProducts = await productModuleService.listProducts({});
        const vendorProducts = allProducts.filter((p) => {
            const metadata = p.metadata || {};
            return metadata.vendor_id === auth.vendor_id;
        });
        const vendorProductIds = new Set(vendorProducts.map((p) => p.id));
        // Get vendor orders
        const allOrders = await orderModuleService.listOrders({});
        const vendorOrders = allOrders.filter((order) => {
            const items = order.items || [];
            return items.some((item) => {
                const productId = item.product_id || item.variant?.product_id;
                return productId && vendorProductIds.has(productId);
            });
        });
        // Calculate stats
        const totalProducts = vendorProducts.length;
        const totalOrders = vendorOrders.length;
        // Calculate total revenue (sum of order totals)
        let totalRevenue = 0;
        vendorOrders.forEach((order) => {
            const total = order.total || 0;
            if (typeof total === 'number') {
                totalRevenue += total;
            }
            else if (total && typeof total === 'object' && total.amount) {
                totalRevenue += total.amount;
            }
        });
        // Get recent orders (last 5)
        const recentOrders = vendorOrders
            .sort((a, b) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateB - dateA;
        })
            .slice(0, 5)
            .map((order) => ({
            id: order.id,
            display_id: order.display_id || order.id,
            email: order.email,
            total: order.total,
            status: order.status,
            created_at: order.created_at,
        }));
        // Products by status
        const productsByStatus = {
            draft: vendorProducts.filter((p) => p.status === 'draft').length,
            published: vendorProducts.filter((p) => p.status === 'published').length,
        };
        return res.json({
            stats: {
                total_products: totalProducts,
                total_orders: totalOrders,
                total_revenue: totalRevenue,
                products_by_status: productsByStatus,
                recent_orders: recentOrders,
            },
        });
    }
    catch (error) {
        console.error("Vendor stats error:", error);
        return res.status(500).json({ message: error?.message || "Failed to get stats" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9zdGF0cy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVlBLDBCQUdDO0FBRUQsa0JBOEVDO0FBOUZELDJDQUFzRDtBQUN0RCxxREFBbUQ7QUFFbkQsc0JBQXNCO0FBQ3RCLFNBQVMsY0FBYyxDQUFDLEdBQW1CO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDakQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxLQUFLLFVBQVUsT0FBTyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDbkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtBQUM5QixDQUFDO0FBRU0sS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQixNQUFNLElBQUksR0FBRyxNQUFNLElBQUEsOEJBQXFCLEVBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2xELElBQUksQ0FBQyxJQUFJO1FBQUUsT0FBTTtJQUVqQixJQUFJLENBQUM7UUFDSCxNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUMzRCxNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUUvRCxzQkFBc0I7UUFDdEIsTUFBTSxXQUFXLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDL0QsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFO1lBQ25ELE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFBO1lBQ2pDLE9BQU8sUUFBUSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFBO1FBQzlDLENBQUMsQ0FBQyxDQUFBO1FBQ0YsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUV0RSxvQkFBb0I7UUFDcEIsTUFBTSxTQUFTLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDekQsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO1lBQ25ELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFBO1lBQy9CLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFO2dCQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFBO2dCQUM3RCxPQUFPLFNBQVMsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDckQsQ0FBQyxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLGtCQUFrQjtRQUNsQixNQUFNLGFBQWEsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFBO1FBQzNDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUE7UUFFdkMsZ0RBQWdEO1FBQ2hELElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQTtRQUNwQixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDbEMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUE7WUFDOUIsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDOUIsWUFBWSxJQUFJLEtBQUssQ0FBQTtZQUN2QixDQUFDO2lCQUFNLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzlELFlBQVksSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFBO1lBQzlCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQTtRQUVGLDZCQUE2QjtRQUM3QixNQUFNLFlBQVksR0FBRyxZQUFZO2FBQzlCLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxDQUFNLEVBQUUsRUFBRTtZQUN2QixNQUFNLEtBQUssR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFBO1lBQ25ELE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUE7WUFDbkQsT0FBTyxLQUFLLEdBQUcsS0FBSyxDQUFBO1FBQ3RCLENBQUMsQ0FBQzthQUNELEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ1gsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BCLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRTtZQUNaLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVSxJQUFJLEtBQUssQ0FBQyxFQUFFO1lBQ3hDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztZQUNsQixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtTQUM3QixDQUFDLENBQUMsQ0FBQTtRQUVMLHFCQUFxQjtRQUNyQixNQUFNLGdCQUFnQixHQUFHO1lBQ3ZCLEtBQUssRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDLE1BQU07WUFDckUsU0FBUyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssV0FBVyxDQUFDLENBQUMsTUFBTTtTQUM5RSxDQUFBO1FBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsS0FBSyxFQUFFO2dCQUNMLGNBQWMsRUFBRSxhQUFhO2dCQUM3QixZQUFZLEVBQUUsV0FBVztnQkFDekIsYUFBYSxFQUFFLFlBQVk7Z0JBQzNCLGtCQUFrQixFQUFFLGdCQUFnQjtnQkFDcEMsYUFBYSxFQUFFLFlBQVk7YUFDNUI7U0FDRixDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFBO1FBQzNDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sSUFBSSxxQkFBcUIsRUFBRSxDQUFDLENBQUE7SUFDbkYsQ0FBQztBQUNILENBQUMifQ==