"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
exports.POST = POST;
const affiliate_1 = require("../../../../modules/affiliate");
const token_1 = require("../../_lib/token");
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
// GET - List all commissions
async function GET(req, res) {
    setCorsHeaders(res, req);
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        const commissions = await affiliateService.listAffiliateCommissions({});
        return res.json({
            commissions: commissions || [],
        });
    }
    catch (error) {
        console.error("Get commissions error:", error);
        return res.status(500).json({
            message: "Failed to fetch commissions",
            error: error?.message || String(error),
            commissions: [],
        });
    }
}
// Helper to read request body - Medusa v2 uses Express which should auto-parse JSON
async function readRequestBody(req) {
    // Method 1: Try (req as any).body first (most common in Medusa v2)
    const expressReq = req;
    if (expressReq.body && typeof expressReq.body === 'object' && expressReq.body !== null && Object.keys(expressReq.body).length > 0) {
        return expressReq.body;
    }
    // Method 2: Try req.body
    if (req.body && typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0) {
        return req.body;
    }
    // Method 3: Try to read from stream manually (if body parser didn't work)
    try {
        if (expressReq.readable !== false) {
            const chunks = [];
            // Read all chunks from the stream
            return new Promise((resolve) => {
                expressReq.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                expressReq.on('end', () => {
                    if (chunks.length > 0) {
                        try {
                            const bodyString = Buffer.concat(chunks).toString('utf-8');
                            if (bodyString && bodyString.trim()) {
                                const parsed = JSON.parse(bodyString);
                                resolve(parsed);
                                return;
                            }
                        }
                        catch (parseError) {
                            console.log("Failed to parse stream body:", parseError?.message);
                        }
                    }
                    resolve({});
                });
                expressReq.on('error', () => {
                    resolve({});
                });
                // If stream is already ended, try to get data
                if (expressReq.readableEnded) {
                    resolve({});
                }
            });
        }
    }
    catch (streamError) {
        console.log("Stream read error:", streamError?.message);
    }
    return {};
}
// Helper to read body from request - handles cases where body parser didn't run
async function getRequestBody(req) {
    const expressReq = req;
    // Try 1: Direct access (most common - body parser already ran)
    if (expressReq.body && typeof expressReq.body === 'object') {
        const keys = Object.keys(expressReq.body);
        if (keys.length > 0) {
            console.log("Found body in expressReq.body with keys:", keys);
            return expressReq.body;
        }
    }
    // Try 2: req.body
    if (req.body && typeof req.body === 'object') {
        const keys = Object.keys(req.body);
        if (keys.length > 0) {
            console.log("Found body in req.body with keys:", keys);
            return req.body;
        }
    }
    // Try 3: Read from stream manually (body parser didn't run)
    console.log("Body parser didn't run, attempting to read from stream...");
    try {
        // Check if stream is readable
        if (expressReq.readable && !expressReq.readableEnded) {
            const chunks = [];
            // Read all data from the stream
            for await (const chunk of expressReq) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            if (chunks.length > 0) {
                const bodyString = Buffer.concat(chunks).toString('utf-8');
                console.log("Read body string from stream:", bodyString.substring(0, 200));
                if (bodyString && bodyString.trim()) {
                    const parsed = JSON.parse(bodyString);
                    console.log("Successfully parsed body from stream");
                    return parsed;
                }
            }
        }
    }
    catch (streamError) {
        console.error("Error reading from stream:", streamError?.message);
    }
    // Try 4: Read from raw body if available
    if (expressReq.rawBody) {
        try {
            if (typeof expressReq.rawBody === 'string') {
                console.log("Found rawBody as string");
                return JSON.parse(expressReq.rawBody);
            }
            else if (Buffer.isBuffer(expressReq.rawBody)) {
                console.log("Found rawBody as buffer");
                return JSON.parse(expressReq.rawBody.toString('utf-8'));
            }
        }
        catch (e) {
            console.log("Failed to parse rawBody:", e);
        }
    }
    console.log("No body found in any location");
    return {};
}
// POST - Create a new commission
async function POST(req, res) {
    setCorsHeaders(res, req);
    // Read body BEFORE authentication to ensure it's available
    let body = {};
    try {
        body = await getRequestBody(req);
    }
    catch (bodyError) {
        console.error("Error reading request body:", bodyError);
        return res.status(400).json({
            message: "Failed to read request body",
            error: bodyError?.message
        });
    }
    const auth = await authenticateAffiliateAdmin(req);
    if (!auth.isValid) {
        return res.status(401).json({
            message: "Unauthorized. Please login as an affiliate admin.",
        });
    }
    try {
        const affiliateService = req.scope.resolve(affiliate_1.AFFILIATE_MODULE);
        console.log("POST /commissions - Body received:", JSON.stringify(body, null, 2));
        console.log("POST /commissions - Body type:", typeof body);
        console.log("POST /commissions - Body keys:", Object.keys(body));
        console.log("POST /commissions - commission_rate:", body?.commission_rate);
        console.log("POST /commissions - Content-Type:", req.headers['content-type']);
        console.log("POST /commissions - All headers:", Object.keys(req.headers));
        // Check if body is empty
        if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
            return res.status(400).json({
                message: "Request body is empty. Please ensure the request includes a JSON body with commission_rate and entity information.",
            });
        }
        // Type the body
        const typedBody = body;
        // Validate commission_rate - must be a number between 0 and 100
        const commissionRateValue = typedBody.commission_rate;
        if (commissionRateValue === undefined || commissionRateValue === null || commissionRateValue === "") {
            console.log("Validation failed: commission_rate is missing or empty");
            return res.status(400).json({
                message: "Commission rate is required",
            });
        }
        const commissionRate = typeof commissionRateValue === 'string'
            ? parseFloat(commissionRateValue)
            : Number(commissionRateValue);
        if (isNaN(commissionRate) || !isFinite(commissionRate)) {
            console.log("Validation failed: commission_rate is not a valid number:", commissionRateValue);
            return res.status(400).json({
                message: "Commission rate must be a valid number",
            });
        }
        if (commissionRate < 0 || commissionRate > 100) {
            console.log("Validation failed: commission_rate is out of range:", commissionRate);
            return res.status(400).json({
                message: "Commission rate must be between 0 and 100",
            });
        }
        console.log("Validation passed: commission_rate =", commissionRate);
        const commission = await affiliateService.createCommission({
            product_id: typedBody.product_id || null,
            category_id: typedBody.category_id || null,
            collection_id: typedBody.collection_id || null,
            type_id: typedBody.type_id || null,
            commission_rate: commissionRate,
            metadata: typedBody.metadata || null,
        });
        return res.json({
            message: "Commission created successfully",
            commission,
        });
    }
    catch (error) {
        console.error("Create commission error:", error);
        if (error.type === "INVALID_DATA" || error.type === "DUPLICATE_ERROR") {
            return res.status(400).json({
                message: error.message || "Invalid commission data",
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to create commission",
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FmZmlsaWF0ZS9hZG1pbi9jb21taXNzaW9ucy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQW1DQSwwQkFHQztBQUdELGtCQXlCQztBQStIRCxvQkFzR0M7QUFyU0QsNkRBQWdFO0FBQ2hFLDRDQUF1RDtBQUV2RCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUIsRUFBRSxHQUFtQjtJQUM5RCxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUE7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxNQUFNLENBQUMsQ0FBQTtJQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVELCtCQUErQjtBQUMvQixLQUFLLFVBQVUsMEJBQTBCLENBQUMsR0FBa0I7SUFDMUQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUE7UUFDNUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFBO1FBQzNCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQ3JDLE1BQU0sTUFBTSxHQUFHLElBQUEsNEJBQW9CLEVBQUMsS0FBSyxDQUFDLENBQUE7UUFF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