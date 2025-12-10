"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
const affiliate_1 = require("../../../../modules/affiliate");
const token_1 = require("../../../affiliate/_lib/token");
// CORS headers helper
function setCorsHeaders(res, req) {
    const origin = req?.headers.origin || '*';
    // When using credentials, we must specify the exact origin, not '*'
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req) {
    try {
        const authHeader = req.headers.authorization;
        console.log("Auth header:", authHeader ? "Present" : "Missing");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.log("No Bearer token found");
            return { isValid: false, error: "No authorization header" };
        }
        const token = authHeader.substring(7);
        console.log("Token extracted, length:", token.length);
        const claims = (0, token_1.verifyAffiliateToken)(token);
        console.log("Token claims:", claims ? { sub: claims.sub, role: claims.role } : "Invalid");
        if (!claims) {
            return { isValid: false, error: "Invalid token" };
        }
        if (claims.role !== "admin") {
            return { isValid: false, error: `Invalid role: ${claims.role}, expected admin` };
        }
        return { isValid: true, adminId: claims.sub };
    }
    catch (error) {
        console.error("Auth error:", error);
        return { isValid: false, error: error?.message || "Authentication error" };
    }
}
async function OPTIONS(req, res) {
    setCorsHeaders(res, req);
    return res.status(200).end();
}
async function GET(req, res) {
    setCorsHeaders(res, req);
    // Authenticate affiliate admin
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        console.log("Authentication failed:", auth.error);
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
            error: auth.error || "Authentication failed",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        // Get all affiliate users
        const affiliateUsers = await affiliateService.listAffiliateUsers({});
        // Remove password_hash from response
        const sanitizedUsers = (affiliateUsers || []).map((user) => {
            const { password_hash, ...rest } = user;
            return rest;
        });
        // Separate by status
        const pendingUsers = sanitizedUsers.filter((u) => !u.is_approved && !u.rejected_at);
        const approvedUsers = sanitizedUsers.filter((u) => u.is_approved);
        const rejectedUsers = sanitizedUsers.filter((u) => u.rejected_at);
        return res.json({
            users: sanitizedUsers,
            pending: pendingUsers,
            approved: approvedUsers,
            rejected: rejectedUsers,
            counts: {
                total: sanitizedUsers.length,
                pending: pendingUsers.length,
                approved: approvedUsers.length,
                rejected: rejectedUsers.length,
            },
        });
    }
    catch (error) {
        console.error("Admin affiliate/users GET error:", error);
        return res.status(500).json({
            message: "Failed to fetch affiliate users",
            error: error?.message || String(error),
            users: [],
            pending: [],
            approved: [],
            rejected: [],
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FmZmlsaWF0ZS91c2Vycy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQStDQSwwQkFHQztBQUVELGtCQXFEQztBQXZHRCw2REFBZ0U7QUFDaEUseURBQW9FO0FBRXBFLHNCQUFzQjtBQUN0QixTQUFTLGNBQWMsQ0FBQyxHQUFtQixFQUFFLEdBQW1CO0lBQzlELE1BQU0sTUFBTSxHQUFHLEdBQUcsRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQTtJQUN6QyxvRUFBb0U7SUFDcEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVELCtCQUErQjtBQUMvQixLQUFLLFVBQVUsMEJBQTBCLENBQUMsR0FBa0I7SUFDMUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDNUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBRS9ELElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFBO1lBQ3BDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFF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