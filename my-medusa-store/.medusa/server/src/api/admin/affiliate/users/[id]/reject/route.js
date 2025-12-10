"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const affiliate_1 = require("../../../../../../modules/affiliate");
const token_1 = require("../../../../../affiliate/_lib/token");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return { isValid: false };
        }
        const token = authHeader.substring(7);
        const claims = (0, token_1.verifyAffiliateToken)(token);
        if (!claims || claims.role !== "admin") {
            return { isValid: false };
        }
        return { isValid: true, adminId: claims.sub };
    }
    catch (error) {
        return { isValid: false };
    }
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
async function POST(req, res) {
    setCorsHeaders(res, req);
    // Authenticate affiliate admin
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        const userId = req.params?.id;
        if (!userId) {
            return res.status(400).json({
                message: "Missing user id",
            });
        }
        const body = req.body || {};
        const { rejection_reason } = body;
        if (!rejection_reason || !rejection_reason.trim()) {
            return res.status(400).json({
                message: "Rejection reason is required"
            });
        }
        // Use authenticated affiliate admin ID
        const adminId = auth.adminId || null;
        const user = await affiliateService.rejectAffiliateUser(userId, rejection_reason.trim(), adminId);
        // Remove password_hash from response
        const { password_hash, ...sanitizedUser } = user;
        return res.json({
            message: "Affiliate user rejected successfully",
            user: sanitizedUser,
        });
    }
    catch (error) {
        console.error("Reject affiliate user error:", error);
        if (error.type === "NOT_FOUND") {
            return res.status(404).json({
                message: error.message || "Affiliate user not found",
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to reject affiliate user",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FmZmlsaWF0ZS91c2Vycy9baWRdL3JlamVjdC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQW1DQSwwQkFHQztBQUVELG9CQXlEQztBQS9GRCxtRUFBc0U7QUFDdEUsK0RBQTBFO0FBRTFFLHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQixFQUFFLEdBQW1CO0lBQzlELE1BQU0sTUFBTSxHQUFHLEdBQUcsRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQTtJQUN6QyxHQUFHLENBQUMsU0FBUyxDQUFDLDZCQUE2QixFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ3BELEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQTtJQUNoRixHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLG9EQUFvRCxDQUFDLENBQUE7SUFDbkcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUMzRCxDQUFDO0FBRUQsK0JBQStCO0FBQy9CLEtBQUssVUFBVSwwQkFBMEIsQ0FBQyxHQUFrQjtJQUMxRCxJQUFJLENBQUM7UUFDSCxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQTtRQUM1QyxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUE7UUFDM0IsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDckMsTUFBTSxNQUFNLEdBQUcsSUFBQSw0QkFBb0IsRUFBQyxLQUFLLENBQUMsQ0FBQTtRQUUx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