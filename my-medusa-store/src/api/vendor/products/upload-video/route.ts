import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../../_lib/guards"
import { boundedUpload } from "../../../../lib/bounded-upload"
import * as path from "path"
import { randomUUID } from "node:crypto"
import { S3Client } from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { s3PublicBaseUrl } from "../../../../lib/s3-access"

function setCorsHeaders(res: MedusaResponse) {
  /* CORS via vendorCorsMiddleware */ void 0
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  return res.status(200).end()
}

/** Process env only — never read .env from disk. */
function getS3Config() {
  const s3Region = process.env.S3_REGION?.trim()
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  const s3Bucket = process.env.S3_BUCKET?.trim()

  if (
    !s3Region ||
    !s3AccessKeyId ||
    !s3SecretAccessKey ||
    !s3Bucket ||
    s3AccessKeyId.includes("REPLACE_ME") ||
    s3AccessKeyId.includes("<") ||
    s3SecretAccessKey.includes("REPLACE_ME") ||
    s3SecretAccessKey.includes("<")
  ) {
    return {
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3Bucket: undefined,
    }
  }

  return { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket }
}

// Sanitize string for use in file paths
function sanitizeForPath(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'product'
}

// Validate video MIME type
function isValidVideoMimeType(mimeType: string): boolean {
  const validVideoTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/ogg',
    'video/x-matroska',
  ]
  return validVideoTypes.includes(mimeType.toLowerCase())
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  
  // Early return for OPTIONS preflight
  if ((req as any).method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  try {
    console.log("📤 Video upload request received")
    console.log("Request method:", (req as any).method)
    console.log("Request URL:", (req as any).url)
    console.log("Request headers:", Object.keys((req as any).headers || {}))
    console.log("Content-Type:", (req as any).headers?.["content-type"] || (req as any).headers?.["Content-Type"])
    
    // Verify vendor authentication FIRST - before any stream processing
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      console.error("❌ Vendor authentication failed")
      return res.status(401).json({ message: "Unauthorized" })
    }
    console.log("✅ Vendor authenticated:", vendorId)

    // Get S3 configuration
    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config()

    if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
      return res.status(500).json({ 
        message: "S3 configuration missing. Please check your .env file." 
      })
    }

    // Initialize S3 client
    const s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
    })

    const s3FileUrl = s3PublicBaseUrl(s3Bucket, s3Region)

    const headers = (req as any).headers || {}
    const bb = boundedUpload(headers, res, { fileSize: 100 * 1024 * 1024, files: 1, totalSize: 100 * 1024 * 1024 })
    const results: Array<{ url: string; key: string; filename: string; originalName: string }> = []
    let pendingUploads = 0
    let busboyFinished = false
    
    // Get product name and collection from form fields
    let productName = ''
    let collectionName = ''
    
    // Store file data temporarily until all fields are parsed
    interface PendingFile {
      buffer: Buffer
      info: { filename: string; encoding: string; mimeType: string }
      name: string
    }
    const pendingFiles: PendingFile[] = []

    const finished = new Promise<void>((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error("Upload timeout - no files received within 60 seconds"))
        }
      }, 60000) // Longer timeout for videos

      const checkComplete = () => {
        // Only resolve when both Busboy is finished AND all uploads are complete
        if (busboyFinished && pendingUploads === 0 && !resolved) {
          console.log("All files processed and uploaded. Total:", results.length)
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      }

      bb.on("file", (name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        console.log("File received:", name, info.filename, info.mimeType)
        
        // Validate video MIME type
        if (!isValidVideoMimeType(info.mimeType)) {
          console.error(`❌ Invalid video MIME type: ${info.mimeType}`)
          file.resume() // Drain the stream
          return
        }
        
        // Buffer file chunks as they arrive
        const fileChunks: Buffer[] = []
        file.on("data", (chunk: Buffer) => {
          fileChunks.push(chunk)
        })
        
        file.on("end", () => {
          // Store buffered file data until all fields are parsed
          pendingFiles.push({
            buffer: Buffer.concat(fileChunks),
            info,
            name,
          })
        })
        
        file.on("error", (err: any) => {
          console.error("File stream error:", err)
          // Don't add to pendingFiles if there's an error
        })
      })

      bb.on("field", (name: string, value: string) => {
        console.log("Field received:", name, value)
        if (name === "productName" || name === "product_name") {
          productName = value || ''
        } else if (name === "collectionName" || name === "collection_name") {
          collectionName = value || ''
        }
      })

      bb.on("error", (error: any) => {
        console.error("Busboy error:", error)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(error)
        }
      })

      bb.on("finish", async () => {
        console.log("Busboy finished parsing. Processing files:", pendingFiles.length)
        busboyFinished = true
        
        // Now that all fields are parsed, process files with correct S3 keys
        for (const pendingFile of pendingFiles) {
          pendingUploads++
          
          const filename = (pendingFile.info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
          const extension = path.extname(filename) || '.mp4'
          const uniqueId = randomUUID().substring(0, 8)
          const videoFilename = `${uniqueId}${extension}`
          
          // Build S3 path based on collection and product name (now we have the fields)
          let s3Key = ''
          const currentProductName = productName || ''
          const currentCollectionName = collectionName || ''
          
          if (currentCollectionName && currentProductName) {
            // product/collection_name/product_name/video/filename
            s3Key = `product/${sanitizeForPath(currentCollectionName)}/${sanitizeForPath(currentProductName)}/video/${videoFilename}`
          } else if (currentProductName) {
            // product/product_name/video/filename
            s3Key = `product/${sanitizeForPath(currentProductName)}/video/${videoFilename}`
          } else {
            // Fallback: product/temp/video/filename
            s3Key = `product/temp/video/${videoFilename}`
          }
          
          // Upload to S3 using multipart upload (handles large files efficiently)
          // Note: We buffer the file because we need to wait for fields to be parsed
          // For very large files, consider using temporary file storage instead
          try {
            const upload = new Upload({
              client: s3Client,
              params: {
                Bucket: s3Bucket,
                Key: s3Key,
                Body: pendingFile.buffer,
                ContentType: pendingFile.info.mimeType || "video/mp4",
              },
            })
            
            await upload.done()
            
            const fileUrl = `${s3FileUrl}/${s3Key}`
            results.push({
              url: fileUrl,
              key: s3Key,
              filename: videoFilename,
              originalName: filename,
            })
            
            console.log(`✅ Uploaded video to S3: ${s3Key}`)
            pendingUploads--
            checkComplete()
          } catch (uploadError: any) {
            console.error("S3 upload error:", uploadError)
            pendingUploads--
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              reject(uploadError)
            }
          }
        }
        
        checkComplete()
      })
    })

    // Try to access raw request stream
    let rawReq: any = null
    
    console.log("🔍 Checking request stream access...")
    console.log("req.raw exists:", !!(req as any).raw)
    console.log("req.req exists:", !!(req as any).req)
    console.log("req.pipe exists:", typeof (req as any).pipe === "function")
    console.log("req.readable exists:", typeof (req as any).readable !== "undefined")
    
    // Try multiple paths to find the raw request stream
    const possiblePaths = [
      () => (req as any).raw,
      () => (req as any).req,
      () => (req as any).request,
      () => (req as any).socket?.request,
      () => req,
    ]
    
    for (const getPath of possiblePaths) {
      try {
        const candidate = getPath()
        if (candidate && typeof candidate.pipe === "function") {
          // Check if stream is readable
          if (candidate.readable !== false && candidate.readableEnded !== true) {
            rawReq = candidate
            console.log("✅ Found readable stream")
            break
          } else {
            console.log("⚠️ Stream found but already consumed")
          }
        }
      } catch {
        // Continue to next path
      }
    }
    
    if (!rawReq) {
      console.error("❌ No readable stream found")
      console.error("Request structure:", {
        hasRaw: !!(req as any).raw,
        hasReq: !!(req as any).req,
        hasPipe: typeof (req as any).pipe === "function",
        keys: Object.keys(req || {}).slice(0, 10),
      })
      return res.status(400).json({ 
        message: "Request stream not available",
        details: "Cannot access request body stream. This might be a Medusa v2 routing issue.",
        suggestion: "Check if the route path is correct and if Medusa is parsing the body before our handler."
      })
    }
    
    try {
      console.log("📥 Piping request to busboy...")
      rawReq.pipe(bb)
    } catch (pipeError: any) {
      console.error("❌ Error piping request to busboy:", pipeError)
      console.error("Pipe error details:", {
        message: pipeError?.message,
        stack: pipeError?.stack,
      })
      return res.status(400).json({ 
        message: "Failed to process request stream",
        error: pipeError?.message || "Unknown pipe error"
      })
    }
    
    await finished

    if (!results.length) {
      return res.status(400).json({ message: "no files received" })
    }

    return res.json({ files: results })
  } catch (error: any) {
    console.error("Error in video upload:", error)
    console.error("Error stack:", error?.stack)
    console.error("Error details:", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    })
    return res.status([413, 429].includes(error?.statusCode) ? error.statusCode : 500).json({
      message: "Failed to upload videos",
      error: error.message || "Unknown error",
    })
  }
}

