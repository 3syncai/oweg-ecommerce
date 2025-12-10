"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
const utils_1 = require("@medusajs/framework/utils");
const pg_1 = require("pg");
// Get products with filters for flash sale selection
const GET = async (req, res) => {
    let dbClient = null;
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const queryParams = req.query;
        const { category, collection, type, search, limit = "100" } = queryParams;
        const limitNum = parseInt(limit) || 100;
        // Fetch all products (or use search if provided)
        let allProducts = [];
        if (search) {
            allProducts = await productModuleService.listProducts({
                q: search,
            });
        }
        else {
            allProducts = await productModuleService.listProducts({});
        }
        // Filter products in memory based on category, collection, and type
        let filteredProducts = allProducts;
        if (category) {
            filteredProducts = filteredProducts.filter((product) => {
                return product.categories?.some((cat) => cat.id === category) || false;
            });
        }
        if (collection) {
            filteredProducts = filteredProducts.filter((product) => {
                return product.collection_id === collection ||
                    product.collections?.some((col) => col.id === collection) || false;
            });
        }
        if (type) {
            filteredProducts = filteredProducts.filter((product) => {
                return product.type_id === type || product.type?.id === type || false;
            });
        }
        // Apply limit after filtering
        filteredProducts = filteredProducts.slice(0, limitNum);
        // Get product IDs
        const productIds = filteredProducts.map((p) => p.id).filter(Boolean);
        if (productIds.length === 0) {
            return res.json({ products: [] });
        }
        // Map prices directly from database
        const pricesMap = new Map();
        try {
            // Connect to database
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                throw new Error("DATABASE_URL environment variable is not set");
            }
            dbClient = new pg_1.Client({
                connectionString: databaseUrl,
            });
            await dbClient.connect();
            console.log(`[Flash Sale Products] Querying database for prices of ${productIds.length} products...`);
            // Based on the actual database structure:
            // product_variant -> product_variant_price_set (variant_id) -> price_set (id) -> price (price_set_id)
            const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");
            // Query: variant -> link table -> price_set -> price
            const priceQuery = `
        SELECT DISTINCT ON (pv.product_id)
          pv.product_id,
          p.amount,
          p.currency_code,
          p.price_set_id
        FROM product_variant pv
        INNER JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        INNER JOIN price_set ps ON ps.id = pvps.price_set_id
        INNER JOIN price p ON p.price_set_id = ps.id
        WHERE pv.product_id IN (${placeholders})
          AND p.amount IS NOT NULL
          AND p.amount > 0
          AND p.deleted_at IS NULL
        ORDER BY pv.product_id, 
                 CASE WHEN p.currency_code = 'inr' THEN 0 ELSE 1 END,
                 p.amount ASC
      `;
            console.log(`[Flash Sale Products] Executing price query for ${productIds.length} products...`);
            const result = await dbClient.query(priceQuery, productIds);
            console.log(`[Flash Sale Products] Query returned ${result.rows.length} price rows`);
            // Map prices: product_id -> amount (prefer INR)
            // Amount is already in rupees, not in cents/paise
            result.rows.forEach((row) => {
                if (row.product_id && row.amount) {
                    // Convert amount to number (it might be a string from database)
                    const amount = typeof row.amount === 'string' ? parseFloat(row.amount) : Number(row.amount);
                    if (isNaN(amount) || amount <= 0) {
                        return; // Skip invalid amounts
                    }
                    const existingPrice = pricesMap.get(row.product_id);
                    const isInr = row.currency_code?.toLowerCase() === "inr";
                    if (!existingPrice) {
                        pricesMap.set(row.product_id, amount);
                    }
                    else if (isInr) {
                        // Replace with INR price (prefer INR)
                        pricesMap.set(row.product_id, amount);
                    }
                }
            });
            console.log(`[Flash Sale Products] Mapped ${pricesMap.size} prices from ${result.rows.length} rows`);
            // If still no prices, log table structure for debugging
            if (pricesMap.size === 0 && result.rows.length === 0) {
                console.log(`[Flash Sale Products] No prices found. Checking data structure...`);
                // Check if variants exist
                const debugProductIds = productIds.slice(0, 5);
                const debugPlaceholders = debugProductIds.map((_, i) => `$${i + 1}`).join(",");
                const variantCheck = await dbClient.query(`
          SELECT pv.id, pv.product_id
          FROM product_variant pv
          WHERE pv.product_id IN (${debugPlaceholders})
          LIMIT 5
        `, debugProductIds);
                console.log(`[Flash Sale Products] Sample variants (${variantCheck.rows.length}):`, variantCheck.rows);
                // Check if link table has data
                if (variantCheck.rows.length > 0) {
                    const variantIds = variantCheck.rows.map((r) => r.id);
                    const linkCheck = await dbClient.query(`
            SELECT pvps.variant_id, pvps.price_set_id
            FROM product_variant_price_set pvps
            WHERE pvps.variant_id IN (${variantIds.map((_, i) => `$${i + 1}`).join(",")})
            LIMIT 5
          `, variantIds.slice(0, 5));
                    console.log(`[Flash Sale Products] Sample links (${linkCheck.rows.length}):`, linkCheck.rows);
                    // Check if prices exist for those price sets
                    if (linkCheck.rows.length > 0) {
                        const priceSetIds = linkCheck.rows.map((r) => r.price_set_id);
                        const priceCheck = await dbClient.query(`
              SELECT p.price_set_id, p.amount, p.currency_code
              FROM price p
              WHERE p.price_set_id IN (${priceSetIds.map((_, i) => `$${i + 1}`).join(",")})
                AND p.deleted_at IS NULL
              LIMIT 10
            `, priceSetIds.slice(0, 10));
                        console.log(`[Flash Sale Products] Sample prices (${priceCheck.rows.length}):`, priceCheck.rows);
                    }
                }
            }
            console.log(`[Flash Sale Products] Final: Mapped ${pricesMap.size} prices for ${productIds.length} products`);
            if (pricesMap.size > 0) {
                const sampleEntries = Array.from(pricesMap.entries()).slice(0, 5);
                console.log(`[Flash Sale Products] Sample prices:`, sampleEntries.map(([productId, amount]) => ({
                    product_id: productId,
                    amount: amount,
                    amount_display: `₹${amount}` // Amount is already in rupees, no conversion needed
                })));
            }
            else {
                console.warn(`[Flash Sale Products] WARNING: No prices mapped! All products will show ₹0`);
            }
        }
        catch (dbError) {
            console.error("[Flash Sale Products] Database query error:", dbError.message);
            console.error("[Flash Sale Products] Error stack:", dbError.stack);
            // Try alternative query structure if the first one fails
            if (dbClient) {
                try {
                    console.log(`[Flash Sale Products] Trying alternative query structure...`);
                    // Alternative: Check what tables actually exist
                    const tableCheck = await dbClient.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (table_name LIKE '%price%' OR table_name LIKE '%variant%' OR table_name LIKE '%money%')
            ORDER BY table_name
          `);
                    console.log(`[Flash Sale Products] Available tables:`, tableCheck.rows.map((r) => r.table_name));
                }
                catch (checkError) {
                    console.error("[Flash Sale Products] Table check failed:", checkError.message);
                }
            }
        }
        finally {
            if (dbClient) {
                await dbClient.end();
                dbClient = null;
            }
        }
        // Format products for response
        const formattedProducts = filteredProducts.map((product) => {
            // Get price from map
            let price = 0;
            if (pricesMap.has(product.id)) {
                const priceAmount = pricesMap.get(product.id) || 0;
                // Amount from database is already in rupees (not in cents/paise)
                // Convert to number if it's a string
                price = typeof priceAmount === 'string' ? parseFloat(priceAmount) : priceAmount;
            }
            // Get first variant ID (products typically have at least one variant)
            const variantId = product.variants && product.variants.length > 0
                ? product.variants[0].id
                : null;
            return {
                id: product.id,
                title: product.title,
                thumbnail: product.thumbnail,
                images: product.images,
                price: price,
                variant_id: variantId,
            };
        });
        return res.json({ products: formattedProducts });
    }
    catch (error) {
        console.error("Error fetching products:", error);
        return res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        });
    }
    finally {
        // Connection already closed in inner finally block
        // No need to close again
    }
};
exports.GET = GET;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2ZsYXNoLXNhbGUvcHJvZHVjdHMvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscURBQW1EO0FBQ25ELDJCQUEyQjtBQUUzQixxREFBcUQ7QUFDOUMsTUFBTSxHQUFHLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ25FLElBQUksUUFBUSxHQUFrQixJQUFJLENBQUE7SUFFbEMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDL0QsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQTtRQUU3QixNQUFNLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssR0FBRyxLQUFLLEVBQUUsR0FBRyxXQUFXLENBQUE7UUFDekUsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEtBQWUsQ0FBQyxJQUFJLEdBQUcsQ0FBQTtRQUVqRCxpREFBaUQ7UUFDakQsSUFBSSxXQUFXLEdBQVUsRUFBRSxDQUFBO1FBRTNCLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWCxXQUFXLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxZQUFZLENBQUM7Z0JBQ3BELENBQUMsRUFBRSxNQUFnQjthQUNwQixDQUFDLENBQUE7UUFDSixDQUFDO2FBQU0sQ0FBQztZQUNOLFdBQVcsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUMzRCxDQUFDO1FBRUQsb0VBQW9FO1FBQ3BFLElBQUksZ0JBQWdCLEdBQUcsV0FBVyxDQUFBO1FBRWxDLElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxN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