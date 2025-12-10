"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = exports.OPTIONS = void 0;
const pg_1 = require("pg");
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
const POST = async (req, res) => {
    setCorsHeaders(res);
    let client = null;
    try {
        const { id: productId, reviewId } = req.params;
        if (!productId || !reviewId) {
            return res.status(400).json({ message: "Product ID and Review ID are required" });
        }
        // Get database URL from environment
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        // Create PostgreSQL client
        client = new pg_1.Client({
            connectionString: databaseUrl,
        });
        await client.connect();
        // Get current helpful count
        const currentResult = await client.query(`SELECT helpful_count FROM product_review WHERE id = $1`, [reviewId]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ message: "Review not found" });
        }
        const currentCount = parseInt(currentResult.rows[0].helpful_count || '0', 10);
        const newCount = (currentCount + 1).toString();
        // Update helpful count
        await client.query(`UPDATE product_review 
       SET helpful_count = $1, updated_at = NOW() 
       WHERE id = $2`, [newCount, reviewId]);
        return res.json({
            message: "Review marked as helpful",
            helpful_count: newCount,
        });
    }
    catch (error) {
        console.error("Error marking review as helpful:", error);
        return res.status(500).json({
            message: "Failed to mark review as helpful",
            error: error.message || "Unknown error",
        });
    }
    finally {
        if (client) {
            await client.end();
        }
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3Byb2R1Y3RzL1tpZF0vcmV2aWV3cy9bcmV2aWV3SWRdL2hlbHBmdWwvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsMkJBQTJCO0FBRTNCLHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQjtJQUN6QyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQ2pELEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQTtJQUNoRixHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLG9EQUFvRCxDQUFDLENBQUE7SUFDbkcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUMzRCxDQUFDO0FBRU0sTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ3ZFLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUE7QUFDOUIsQ0FBQyxDQUFBO0FBSFksUUFBQSxPQUFPLFdBR25CO0FBRU0sTUFBTSxJQUFJLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ3BFLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUVuQixJQUFJLE1BQU0sR0FBa0IsSUFBSSxDQUFBO0lBRWhDLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUE7UUFDOUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzVCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsQ0FBQyxDQUFBO1FBQ25GLENBQUM7UUFFRCxvQ0FBb0M7UUFDcEMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUE7UUFFNUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsOENBQThDLENBQUMsQ0FBQTtRQUNqRSxDQUFDO1FBRUQsMkJBQTJCO1FBQzNCLE1BQU0sR0FBRyxJQUFJLFdBQU0sQ0FBQztZQUNsQixnQkFBZ0IsRUFBRSxXQUFXO1NBQzlCLENBQUMsQ0FBQTtRQUVGLE1BQU0sTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBRXRCLDRCQUE0QjtRQUM1QixNQUFNLGFBQWEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQ3RDLHdEQUF3RCxFQUN4RCxDQUFDLFFBQVEsQ0FBQyxDQUNYLENBQUE7UUFFRCxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFBO1FBQzlELENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQzdFLE1BQU0sUUFBUSxHQUFHLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFBO1FBRTlDLHVCQUF1QjtRQUN2QixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQ2hCOztxQkFFZSxFQUNmLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUNyQixDQUFBO1FBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2QsT0FBTyxFQUFFLDBCQUEwQjtZQUNuQyxhQUFhLEVBQUUsUUFBUTtTQUN4QixDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBQ3hELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDMUIsT0FBTyxFQUFFLGtDQUFrQztZQUMzQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxlQUFlO1NBQ3hDLENBQUMsQ0FBQTtJQUNKLENBQUM7WUFBUyxDQUFDO1FBQ1QsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNYLE1BQU0sTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFBO1FBQ3BCLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQyxDQUFBO0FBN0RZLFFBQUEsSUFBSSxRQTZEaEIifQ==