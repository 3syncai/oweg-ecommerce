import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import { verifyAffiliateToken } from "../../_lib/token"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req: MedusaRequest): Promise<{ isValid: boolean; adminId?: string }> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isValid: false }
    }

    const token = authHeader.substring(7)
    const claims = verifyAffiliateToken(token)
    
    if (!claims || claims.role !== "admin") {
      return { isValid: false }
    }

    return { isValid: true, adminId: claims.sub }
  } catch (error) {
    return { isValid: false }
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

// GET - List all commissions
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    const commissions = await affiliateService.listAffiliateCommissions({})

    return res.json({
      commissions: commissions || [],
    })
  } catch (error: any) {
    console.error("Get commissions error:", error)
    return res.status(500).json({
      message: "Failed to fetch commissions",
      error: error?.message || String(error),
      commissions: [],
    })
  }
}

// Helper to read request body - Medusa v2 uses Express which should auto-parse JSON
async function readRequestBody(req: MedusaRequest): Promise<any> {
  // Method 1: Try (req as any).body first (most common in Medusa v2)
  const expressReq = req as any
  if (expressReq.body && typeof expressReq.body === 'object' && expressReq.body !== null && Object.keys(expressReq.body).length > 0) {
    return expressReq.body
  }
  
  // Method 2: Try req.body
  if (req.body && typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0) {
    return req.body
  }
  
  // Method 3: Try to read from stream manually (if body parser didn't work)
  try {
    if (expressReq.readable !== false) {
      const chunks: Buffer[] = []
      
      // Read all chunks from the stream
      return new Promise((resolve) => {
        expressReq.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        
        expressReq.on('end', () => {
          if (chunks.length > 0) {
            try {
              const bodyString = Buffer.concat(chunks).toString('utf-8')
              if (bodyString && bodyString.trim()) {
                const parsed = JSON.parse(bodyString)
                resolve(parsed)
                return
              }
            } catch (parseError: any) {
              console.log("Failed to parse stream body:", parseError?.message)
            }
          }
          resolve({})
        })
        
        expressReq.on('error', () => {
          resolve({})
        })
        
        // If stream is already ended, try to get data
        if (expressReq.readableEnded) {
          resolve({})
        }
      })
    }
  } catch (streamError: any) {
    console.log("Stream read error:", streamError?.message)
  }
  
  return {}
}

// Helper to read body from request - handles cases where body parser didn't run
async function getRequestBody(req: MedusaRequest): Promise<any> {
  const expressReq = req as any
  
  // Try 1: Direct access (most common - body parser already ran)
  if (expressReq.body && typeof expressReq.body === 'object') {
    const keys = Object.keys(expressReq.body)
    if (keys.length > 0) {
      console.log("Found body in expressReq.body with keys:", keys)
      return expressReq.body
    }
  }
  
  // Try 2: req.body
  if (req.body && typeof req.body === 'object') {
    const keys = Object.keys(req.body)
    if (keys.length > 0) {
      console.log("Found body in req.body with keys:", keys)
      return req.body
    }
  }
  
  // Try 3: Read from stream manually (body parser didn't run)
  console.log("Body parser didn't run, attempting to read from stream...")
  try {
    // Check if stream is readable
    if (expressReq.readable && !expressReq.readableEnded) {
      const chunks: Buffer[] = []
      
      // Read all data from the stream
      for await (const chunk of expressReq) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      
      if (chunks.length > 0) {
        const bodyString = Buffer.concat(chunks).toString('utf-8')
        console.log("Read body string from stream:", bodyString.substring(0, 200))
        if (bodyString && bodyString.trim()) {
          const parsed = JSON.parse(bodyString)
          console.log("Successfully parsed body from stream")
          return parsed
        }
      }
    }
  } catch (streamError: any) {
    console.error("Error reading from stream:", streamError?.message)
  }
  
  // Try 4: Read from raw body if available
  if (expressReq.rawBody) {
    try {
      if (typeof expressReq.rawBody === 'string') {
        console.log("Found rawBody as string")
        return JSON.parse(expressReq.rawBody)
      } else if (Buffer.isBuffer(expressReq.rawBody)) {
        console.log("Found rawBody as buffer")
        return JSON.parse(expressReq.rawBody.toString('utf-8'))
      }
    } catch (e) {
      console.log("Failed to parse rawBody:", e)
    }
  }
  
  console.log("No body found in any location")
  return {}
}

// POST - Create a new commission
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  // Read body BEFORE authentication to ensure it's available
  let body: any = {}
  try {
    body = await getRequestBody(req)
  } catch (bodyError: any) {
    console.error("Error reading request body:", bodyError)
    return res.status(400).json({
      message: "Failed to read request body",
      error: bodyError?.message
    })
  }

  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    
    console.log("POST /commissions - Body received:", JSON.stringify(body, null, 2))
    console.log("POST /commissions - Body type:", typeof body)
    console.log("POST /commissions - Body keys:", Object.keys(body))
    console.log("POST /commissions - commission_rate:", body?.commission_rate)
    console.log("POST /commissions - Content-Type:", req.headers['content-type'])
    console.log("POST /commissions - All headers:", Object.keys(req.headers))
    
    // Check if body is empty
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      return res.status(400).json({
        message: "Request body is empty. Please ensure the request includes a JSON body with commission_rate and entity information.",
      })
    }
    
    // Type the body
    const typedBody = body as {
      product_id?: string | null
      category_id?: string | null
      collection_id?: string | null
      type_id?: string | null
      commission_rate?: number | string
      metadata?: any
    }

    // Validate commission_rate - must be a number between 0 and 100
    const commissionRateValue = typedBody.commission_rate
    if (commissionRateValue === undefined || commissionRateValue === null || commissionRateValue === "") {
      console.log("Validation failed: commission_rate is missing or empty")
      return res.status(400).json({
        message: "Commission rate is required",
      })
    }

    const commissionRate = typeof commissionRateValue === 'string' 
      ? parseFloat(commissionRateValue) 
      : Number(commissionRateValue)
      
    if (isNaN(commissionRate) || !isFinite(commissionRate)) {
      console.log("Validation failed: commission_rate is not a valid number:", commissionRateValue)
      return res.status(400).json({
        message: "Commission rate must be a valid number",
      })
    }

    if (commissionRate < 0 || commissionRate > 100) {
      console.log("Validation failed: commission_rate is out of range:", commissionRate)
      return res.status(400).json({
        message: "Commission rate must be between 0 and 100",
      })
    }
    
    console.log("Validation passed: commission_rate =", commissionRate)

    const commission = await affiliateService.createCommission({
      product_id: typedBody.product_id || null,
      category_id: typedBody.category_id || null,
      collection_id: typedBody.collection_id || null,
      type_id: typedBody.type_id || null,
      commission_rate: commissionRate,
      metadata: typedBody.metadata || null,
    })

    return res.json({
      message: "Commission created successfully",
      commission,
    })
  } catch (error: any) {
    console.error("Create commission error:", error)
    if (error.type === "INVALID_DATA" || error.type === "DUPLICATE_ERROR") {
      return res.status(400).json({
        message: error.message || "Invalid commission data",
      })
    }
    return res.status(500).json({
      message: error?.message || "Failed to create commission",
    })
  }
}

