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
  // Set CORS headers for all vendor routes
  res.setHeader('Access-Control-Allow-Origin', '*')
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
