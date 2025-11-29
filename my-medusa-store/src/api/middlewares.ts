import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

async function corsMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Get allowed origins from environment or use default
  // Supports comma-separated URLs: "http://localhost:3000,https://oweg-ecommerce.vercel.app"
  const allowedOrigins = process.env.STORE_CORS || process.env.AUTH_CORS || "http://localhost:3000,https://oweg-ecommerce.vercel.app"
  const originList = allowedOrigins.split(',').map(o => o.trim())
  
  // Get the origin from the request
  const origin = (req as any).headers?.origin || (req as any).headers?.referer
  
  // Check if the origin is allowed
  const allowedOrigin = origin && originList.includes(origin) 
    ? origin 
    : originList.includes('*') 
      ? '*' 
      : originList[0] // Default to first allowed origin
  
  // Set CORS headers for all vendor routes
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Max-Age', '86400') // 24 hours

  // Handle preflight OPTIONS request
  if ((req as any).method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
}

export default defineMiddlewares({
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
})
