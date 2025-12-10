"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = exports.GET = exports.OPTIONS = void 0;
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
const GET = async (req, res) => {
    setCorsHeaders(res);
    let client = null;
    try {
        const { id: productId } = req.params;
        if (!productId) {
            return res.status(400).json({ message: "Product ID is required" });
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
        // Query reviews from database - show approved reviews and pending reviews
        // (pending reviews will be visible to users who submitted them)
        const result = await client.query(`SELECT * FROM product_review 
       WHERE product_id = $1 
       AND deleted_at IS NULL 
       AND (status = 'approved' OR status = 'pending')
       ORDER BY created_at DESC`, [productId]);
        console.log(`Found ${result.rows.length} reviews for product ${productId}`);
        // Parse JSON fields (images, videos) from database
        const reviews = (result.rows || []).map((review) => {
            try {
                if (review.images && typeof review.images === 'string') {
                    review.images = JSON.parse(review.images);
                }
                else if (!review.images) {
                    review.images = [];
                }
                if (review.videos && typeof review.videos === 'string') {
                    review.videos = JSON.parse(review.videos);
                }
                else if (!review.videos) {
                    review.videos = [];
                }
            }
            catch (e) {
                console.error('Error parsing review images/videos:', e);
                // If parsing fails, set to empty array
                review.images = [];
                review.videos = [];
            }
            return review;
        });
        console.log(`Returning ${reviews.length} parsed reviews`);
        return res.json({ reviews });
    }
    catch (error) {
        console.error("Error fetching reviews:", error);
        return res.status(500).json({
            message: "Failed to fetch reviews",
            error: error.message || "Unknown error",
        });
    }
    finally {
        if (client) {
            await client.end();
        }
    }
};
exports.GET = GET;
const POST = async (req, res) => {
    setCorsHeaders(res);
    let client = null;
    try {
        const { id: productId } = req.params;
        if (!productId) {
            return res.status(400).json({ message: "Product ID is required" });
        }
        const body = req.body || {};
        const { title, content, rating, images, videos, reviewer_name, reviewer_email } = body;
        // Validate required fields
        if (!title || !title.trim()) {
            return res.status(400).json({ message: "Review title is required" });
        }
        if (!rating) {
            return res.status(400).json({ message: "Rating is required" });
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
        // Generate review ID
        const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        // Get customer ID from auth if available
        const customerId = req.auth_context?.actor_id || null;
        // Insert review into database
        await client.query(`INSERT INTO product_review (
        id, product_id, customer_id, reviewer_name, reviewer_email,
        title, content, rating, images, videos, 
        verified_purchase, helpful_count, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`, [
            reviewId,
            productId,
            customerId,
            reviewer_name || 'Anonymous',
            reviewer_email || null,
            title.trim(),
            content || '',
            rating.toString(),
            images ? JSON.stringify(images) : null,
            videos ? JSON.stringify(videos) : null,
            false, // verified_purchase
            '0', // helpful_count
            'approved', // status - auto-approve reviews for immediate display
        ]);
        return res.json({
            message: "Review submitted successfully",
            review: {
                id: reviewId,
                product_id: productId,
                title,
                rating,
                status: 'pending',
            },
        });
    }
    catch (error) {
        console.error("Error creating review:", error);
        return res.status(500).json({
            message: "Failed to create review",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3Byb2R1Y3RzL1tpZF0vcmV2aWV3cy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwyQkFBMkI7QUFFM0Isc0JBQXNCO0FBQ3RCLFNBQVMsY0FBYyxDQUFDLEdBQW1CO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDakQsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFBO0lBQ2hGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQzNELENBQUM7QUFFTSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBa0IsRUFBRSxHQUFtQixFQUFFLEVBQUU7SUFDdkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtBQUM5QixDQUFDLENBQUE7QUFIWSxRQUFBLE9BQU8sV0FHbkI7QUFFTSxNQUFNLEdBQUcsR0FBRyxLQUFLLEVBQUUsR0FBa0IsRUFBRSxHQUFtQixFQUFFLEVBQUU7SUFDbkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBRW5CLElBQUksTUFBTSxHQUFrQixJQUFJLENBQUE7SUFFaEMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFBO1FBQ3BDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENB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