"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("@medusajs/framework/http");
async function corsMiddleware(req, res, next) {
    // Get allowed origins from environment or use default
    // Supports comma-separated URLs: "http://localhost:3000,http://localhost:5000,https://oweg-ecommerce.vercel.app"
    const allowedOrigins = process.env.STORE_CORS || process.env.AUTH_CORS || "http://localhost:3000,http://localhost:5000,https://oweg-ecommerce.vercel.app";
    const originList = allowedOrigins.split(',').map(o => o.trim());
    // Get the origin from the request
    const origin = req.headers?.origin || req.headers?.referer;
    // Check if the origin is allowed
    const allowedOrigin = origin && originList.includes(origin)
        ? origin
        : originList.includes('*')
            ? '*'
            : originList[0]; // Default to first allowed origin
    // Set CORS headers for all vendor routes
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
}
exports.default = (0, http_1.defineMiddlewares)({
    routes: [
        {
            matcher: /^\/vendor\/.*/,
            middlewares: [corsMiddleware],
        },
        {
            matcher: /^\/store\/vendors\/.*/,
            middlewares: [corsMiddleware],
        },
    ],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlkZGxld2FyZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvYXBpL21pZGRsZXdhcmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsbURBQTREO0FBTzVELEtBQUssVUFBVSxjQUFjLENBQzNCLEdBQWtCLEVBQ2xCLEdBQW1CLEVBQ25CLElBQXdCO0lBRXhCLHNEQUFzRDtJQUN0RCxpSEFBaUg7SUFDakgsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLElBQUksK0VBQStFLENBQUE7SUFDekosTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQTtJQUUvRCxrQ0FBa0M7SUFDbEMsTUFBTSxNQUFNLEdBQUksR0FBVyxDQUFDLE9BQU8sRUFBRSxNQUFNLElBQUssR0FBVyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUE7SUFFNUUsaUNBQWlDO0lBQ2pDLE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUN6RCxDQUFDLENBQUMsTUFBTTtRQUNSLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUN4QixDQUFDLENBQUMsR0FBRztZQUNMLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQyxrQ0FBa0M7SUFFdEQseUNBQXlDO0lBQ3pDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsYUFBYSxDQUFDLENBQUE7SUFDM0QsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFBO0lBQ3ZGLEdBQUcsQ0FBQyxTQUFTLENBQUMsOEJBQThCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQTtJQUNuRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ3pELEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLENBQUEsQ0FBQyxXQUFXO0lBRTVELG1DQUFtQztJQUNuQyxJQUFLLEdBQVcsQ0FBQyxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDdEMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0lBQzlCLENBQUM7SUFFRCxJQUFJLEVBQUUsQ0FBQTtBQUNSLENBQUM7QUFFRCxrQkFBZSxJQUFBLHdCQUFpQixFQUFDO0lBQy9CLE1BQU0sRUFBRTtRQUNOO1lBQ0UsT0FBTyxFQUFFLGVBQWU7WUFDeEIsV0FBVyxFQUFFLENBQUMsY0FBYyxDQUFDO1NBQzlCO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsdUJBQXVCO1lBQ2hDLFdBQVcsRUFBRSxDQUFDLGNBQWMsQ0FBQztTQUM5QjtLQUNGO0NBQ0YsQ0FBQyxDQUFBIn0=