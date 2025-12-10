"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.POST = POST;
const affiliate_1 = require("../../../../../../modules/affiliate");
const token_1 = require("../../../../_lib/token");
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
        // Use authenticated affiliate admin ID
        const adminId = auth.adminId || null;
        const user = await affiliateService.approveAffiliateUser(userId, adminId);
        // Remove password_hash from response
        const { password_hash, ...sanitizedUser } = user;
        return res.json({
            message: "Affiliate user approved successfully",
            user: sanitizedUser,
        });
    }
    catch (error) {
        console.error("Approve affiliate user error:", error);
        if (error.type === "NOT_FOUND") {
            return res.status(404).json({
                message: error.message || "Affiliate user not found",
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to approve affiliate user",
            error: error?.toString()
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9hZG1pbi91c2Vycy9baWRdL2FwcHJvdmUvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFtQ0EsMEJBR0M7QUFFRCxvQkFnREM7QUF0RkQsbUVBQXNFO0FBQ3RFLGtEQUE2RDtBQUU3RCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUIsRUFBRSxHQUFtQjtJQUM5RCxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUE7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVELCtCQUErQjtBQUMvQixLQUFLLFVBQVUsMEJBQTBCLENBQUMsR0FBa0I7SUFDMUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDNUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ3JDLE1BQU0sTUFBTSxHQUFHLElBQUEsNEJBQW9CLEVBQUMsS0FBSyxDQUFDLENBQUE7UUFF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