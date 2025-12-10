"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = exports.OPTIONS = void 0;
const guards_1 = require("../_lib/guards");
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
const OPTIONS = async (req, res) => {
    setCorsHeaders(res);
    return res.status(200).end();
};
exports.OPTIONS = OPTIONS;
const GET = async (req, res) => {
    setCorsHeaders(res);
    try {
        // Verify vendor authentication
        const vendorId = await (0, guards_1.requireVendorAuth)(req);
        if (!vendorId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // Get query parameters
        const { limit = 100, offset = 0 } = req.query;
        // Fetch all product categories
        const query = req.scope.resolve("query");
        const { data: categories, metadata } = await query.graph({
            entity: "product_category",
            fields: [
                "id",
                "name",
                "handle",
                "is_active",
                "is_internal",
                "parent_category_id",
                "rank",
                "created_at",
                "updated_at",
            ],
            pagination: {
                skip: Number(offset),
                take: Number(limit),
            },
        });
        return res.json({
            product_categories: categories || [],
            count: metadata?.count || 0,
            offset: Number(offset),
            limit: Number(limit),
        });
    }
    catch (error) {
        console.error("Error fetching categories:", error);
        return res.status(500).json({
            message: "Failed to fetch categories",
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.GET = GET;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9jYXRlZ29yaWVzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDJDQUFrRDtBQUVsRCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUI7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUN2RSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQzlCLENBQUMsQ0FBQTtBQUhZLFFBQUEsT0FBTyxXQUduQjtBQUVNLE1BQU0sR0FBRyxHQUFHLEtBQUssRUFBRSxHQUFrQixFQUFFLEdBQW1CLEVBQUUsRUFBRTtJQUNuRSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsSUFBSSxDQUFDO1FBQ0gsK0JBQStCO1FBQy9CLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSwwQkFBaUIsRUFBQyxHQUFHLENBQUMsQ0FBQTtRQUM3QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUE7UUFDMUQsQ0FBQztRQUVELHVCQUF1QjtRQUN2QixNQUFNLEVBQUUsS0FBSyxHQUFHLEdBQUcsRUFBRSxNQUFNLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQTtRQUU3QywrQkFBK0I7UUFDL0IsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFeEMsTUFBTSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3ZELE1BQU0sRUFBRSxrQkFBa0I7WUFDMUIsTUFBTSxFQUFFO2dCQUNOLElBQUk7Z0JBQ0osTUFBTTtnQkFDTixRQUFRO2dCQUNSLFdBQVc7Z0JBQ1gsYUFBYTtnQkFDYixvQkFBb0I7Z0JBQ3BCLE1BQU07Z0JBQ04sWUFBWTtnQkFDWixZQUFZO2FBQ2I7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsSUFBSSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3BCLElBQUksRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDO2FBQ3BCO1NBQ0YsQ0FBQyxDQUFBO1FBRUYsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2Qsa0JBQWtCLEVBQUUsVUFBVSxJQUFJLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQztZQUMzQixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUN0QixLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQztTQUNyQixDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDbEQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsNEJBQTRCO1lBQ3JDLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQzlELENBQUMsQ0FBQTtJQUNKLENBQUM7QUFDSCxDQUFDLENBQUE7QUEvQ1ksUUFBQSxHQUFHLE9BK0NmIn0=