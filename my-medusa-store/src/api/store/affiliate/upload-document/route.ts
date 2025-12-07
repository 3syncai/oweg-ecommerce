import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import Busboy from "busboy"
import path from "path"
import { randomUUID } from "crypto"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  // When using credentials, we must specify the exact origin, not '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

function getS3Config() {
  return {
    s3Region: process.env.S3_REGION?.trim() || "",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
    s3Bucket: process.env.S3_BUCKET?.trim() || "",
  }
}

// Sanitize string for use in file paths
function sanitizeForPath(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'user'
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  try {
    // Get S3 configuration
    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config()

    if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
      return res.status(500).json({
        message: "S3 configuration missing. Please check your .env file.",
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

    const s3FileUrl = process.env.S3_FILE_URL || `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`

    const headers = (req as any).headers || {}
    const bb = Busboy({ headers })
    const results: Array<{ url: string; key: string; filename: string; originalName: string; fieldName: string }> = []
    let fileCount = 0
    let pendingUploads = 0
    let busboyFinished = false
    let userName = ''
    let userEmail = ''

    const finished = new Promise<void>((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error("Upload timeout - no files received within 30 seconds"))
        }
      }, 30000)

      const checkComplete = () => {
        if (busboyFinished && pendingUploads === 0 && !resolved) {
          console.log("All files processed and uploaded. Total:", results.length)
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      }

      // Handle form fields
      bb.on("field", (name: string, value: string) => {
        if (name === "userName") {
          userName = value
        } else if (name === "userEmail") {
          userEmail = value
        }
      })

      bb.on("file", (name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
        console.log("File received:", name, info.filename, info.mimeType)
        fileCount++
        pendingUploads++

        const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
        const extension = path.extname(filename) || '.png'
        const uniqueId = randomUUID().substring(0, 8)
        const imageFilename = `${uniqueId}${extension}`

        // Build S3 path: affiliate/users/{userName}/documents/{fieldName}/{filename}
        const sanitizedName = sanitizeForPath(userName || userEmail || "user")
        const fieldName = name || "document"
        const s3Key = `affiliate/users/${sanitizedName}/documents/${fieldName}/${imageFilename}`

        // Read file into buffer
        const fileChunks: Buffer[] = []

        file.on("data", (chunk: Buffer) => {
          fileChunks.push(chunk)
        })

        file.on("end", async () => {
          try {
            const fileBuffer = Buffer.concat(fileChunks)

            // Upload to S3
            const command = new PutObjectCommand({
              Bucket: s3Bucket,
              Key: s3Key,
              Body: fileBuffer,
              ContentType: info.mimeType || "image/png",
            })

            await s3Client.send(command)

            const fileUrl = `${s3FileUrl}/${s3Key}`
            results.push({
              url: fileUrl,
              key: s3Key,
              filename: imageFilename,
              originalName: filename,
              fieldName: fieldName,
            })

            console.log(`✅ Uploaded to S3: ${s3Key}`)
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
        })

        file.on("error", (err: any) => {
          console.error("File stream error:", err)
          pendingUploads--
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            reject(err)
          }
        })
      })

      bb.on("finish", () => {
        console.log("Busboy finished. Files received:", fileCount)
        busboyFinished = true
        checkComplete()
      })

      bb.on("error", (err: any) => {
        console.error("Busboy error:", err)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(err)
        }
      })

      // Pipe request to busboy
      ;(req as any).pipe(bb)
    })

    await finished

    return res.json({
      files: results,
      message: `Successfully uploaded ${results.length} file(s)`,
    })
  } catch (error: any) {
    console.error("Document upload error:", error)
    return res.status(500).json({
      message: "Failed to upload documents",
      error: error?.message || String(error),
    })
  }
}

