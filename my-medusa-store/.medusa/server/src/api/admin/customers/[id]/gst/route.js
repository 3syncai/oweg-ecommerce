"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const pg_1 = require("pg");
async function GET(req, res) {
    let client = null;
    try {
        const customerId = req.params.id;
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }
        // Get database URL from environment or use direct connection
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        // Create PostgreSQL client
        client = new pg_1.Client({
            connectionString: databaseUrl,
        });
        await client.connect();
        const sql = `
      SELECT 
        id,
        customer_id,
        gst_number,
        gst_status,
        business_name,
        bank_name,
        bank_branch_number,
        bank_swift_code,
        bank_account_name,
        bank_account_number,
        created_at
      FROM customer_gst
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        // Execute raw SQL query
        const result = await client.query(sql, [customerId]);
        // If row exists → return row (even if columns are null)
        if (result.rows && result.rows.length > 0) {
            return res.status(200).json({
                gst_details: result.rows[0],
            });
        }
        // If no row exists → return empty structure
        return res.status(200).json({
            gst_details: {
                id: null,
                customer_id: customerId,
                gst_number: null,
                gst_status: null,
                business_name: null,
                bank_name: null,
                bank_branch_number: null,
                bank_swift_code: null,
                bank_account_name: null,
                bank_account_number: null,
                created_at: null,
            },
        });
    }
    catch (err) {
        console.error("GST API error:", err);
        return res.status(500).json({
            message: "Server Error",
            error: err?.message || String(err),
        });
    }
    finally {
        // Always close the connection
        if (client) {
            await client.end().catch(console.error);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2N1c3RvbWVycy9baWRdL2dzdC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLGtCQWlGQztBQW5GRCwyQkFBMkI7QUFFcEIsS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQy9ELElBQUksTUFBTSxHQUFrQixJQUFJLENBQUE7SUFFaEMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUE7UUFFaEMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsQ0FBQyxDQUFBO1FBQ3JFLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUE7UUFFNUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsOENBQThDLENBQUMsQ0FBQTtRQUNqRSxDQUFDO1FBRUQsMkJBQTJCO1FBQzNCLE1BQU0sR0FBRyxJQUFJLFdBQU0sQ0FBQztZQUNsQixnQkFBZ0IsRUFBRSxXQUFXO1NBQzlCLENBQUMsQ0FBQTtRQUVGLE1BQU0sTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFBO1FBRXRCLE1BQU0sR0FBRyxHQUFHOzs7Ozs7Ozs7Ozs7Ozs7OztLQWlCWCxDQUFBO1FBRUQsd0JBQXdCO1FBQ3hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFBO1FBRXBELHdEQUF3RDtRQUN4RCxJQUFJLE1BQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDMUMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2FBQzVCLENBQUMsQ0FBQTtRQUNKLENBQUM7UUFFRCw0Q0FBNEM7UUFDNUMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixXQUFXLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFLElBQUk7Z0JBQ1IsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLFNBQVMsRUFBRSxJQUFJO2dCQUNmLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGVBQWUsRUFBRSxJQUFJO2dCQUNyQixpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixtQkFBbUIsRUFBRSxJQUFJO2dCQUN6QixVQUFVLEVBQUUsSUFBSTthQUNqQjtTQUNGLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1FBQ2xCLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDcEMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMxQixPQUFPLEVBQUUsY0FBYztZQUN2QixLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDO1NBQ25DLENBQUMsQ0FBQTtJQUNKLENBQUM7WUFBUyxDQUFDO1FBQ1QsOEJBQThCO1FBQzlCLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWCxNQUFNLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ3pDLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQyJ9