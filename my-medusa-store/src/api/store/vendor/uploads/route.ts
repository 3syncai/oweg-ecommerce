import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import Busboy from "busboy"
import path from "path"
import { randomUUID } from "crypto"

/**
 * POST /store/vendor/uploads
 *
 * Multipart upload endpoint used by the vendor portal seller-registration
 * form (logo, banner, cancel cheque, additional documents).
 *
 * Contract (set by `vendorSignupApi.uploadFile` in vendor-portal/lib/api/client.ts):
 *   FormData:
 *     - type:        'logo' | 'banner' | 'cancelcheque' | 'doc' | 'pancard'
 *     - vendorHint:  sanitized store name (used to namespace the S3 key)
 *     - file:        the binary file
 *   Response:
 *     { files: [{ url, key, filename, originalName, fieldName, type }], message }
 *
 * Modeled after /store/affiliate/upload-document but namespaces uploads
 * under `vendor/<vendorHint>/<type>/...` and tags each result with the
 * `type` value so the client can find the cancel-cheque URL again.
 */

function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || "*"
  // When using credentials, we must echo the exact origin (not `*`).
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

function getS3Config() {
  return {
    s3Region: process.env.S3_REGION?.trim() || "",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
    s3Bucket: process.env.S3_BUCKET?.trim() || "",
  }
}

function sanitizeForPath(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50) || "vendor"
  )
}

const ALLOWED_TYPES = new Set(["logo", "banner", "cancelcheque", "doc", "pancard"])

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  try {
    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config()

    if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
      return res.status(500).json({
        message:
          "S3 configuration missing. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in the Medusa .env.",
      })
    }

    const s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
    })

    const s3FileUrl =
      process.env.S3_FILE_URL ||
      `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`

    const headers = (req as any).headers || {}
    const bb = Busboy({ headers })

    const results: Array<{
      url: string
      key: string
      filename: string
      originalName: string
      fieldName: string
      type: string
    }> = []

    let fileCount = 0
    let pendingUploads = 0
    let busboyFinished = false
    let vendorHint = ""
    // We need `type` before each file body lands, but multipart is streamed
    // in order — the frontend sends `type` and `vendorHint` first, then
    // `file`, which is the natural busboy order, so this is safe.
    let uploadType = "doc"

    const finished = new Promise<void>((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error("Upload timeout — no files received within 30 seconds"))
        }
      }, 30_000)

      const checkComplete = () => {
        if (busboyFinished && pendingUploads === 0 && !resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      }

      bb.on("field", (name: string, value: string) => {
        if (name === "type") {
          uploadType = ALLOWED_TYPES.has(value) ? value : "doc"
        } else if (name === "vendorHint") {
          vendorHint = value
        }
      })

      bb.on(
        "file",
        (
          name: string,
          file: NodeJS.ReadableStream,
          info: { filename: string; encoding: string; mimeType: string }
        ) => {
          fileCount++
          pendingUploads++

          const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
          const extension = path.extname(filename) || ""
          const uniqueId = randomUUID().substring(0, 8)
          const storedFilename = `${uniqueId}${extension}`

          const sanitizedVendor = sanitizeForPath(vendorHint || "vendor")
          const fieldName = name || "file"
          const s3Key = `vendor/${sanitizedVendor}/${uploadType}/${storedFilename}`

          const fileChunks: Buffer[] = []

          file.on("data", (chunk: Buffer) => {
            fileChunks.push(chunk)
          })

          file.on("end", async () => {
            try {
              const fileBuffer = Buffer.concat(fileChunks)

              const command = new PutObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: info.mimeType || "application/octet-stream",
              })

              await s3Client.send(command)

              const fileUrl = `${s3FileUrl}/${s3Key}`
              results.push({
                url: fileUrl,
                key: s3Key,
                filename: storedFilename,
                originalName: filename,
                fieldName,
                type: uploadType,
              })

              pendingUploads--
              checkComplete()
            } catch (uploadError: any) {
              console.error("[vendor/uploads] S3 upload error:", uploadError)
              pendingUploads--
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                reject(uploadError)
              }
            }
          })

          file.on("error", (err: any) => {
            console.error("[vendor/uploads] File stream error:", err)
            pendingUploads--
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              reject(err)
            }
          })
        }
      )

      bb.on("finish", () => {
        busboyFinished = true
        checkComplete()
      })

      bb.on("error", (err: any) => {
        console.error("[vendor/uploads] Busboy error:", err)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(err)
        }
      })

      ;(req as any).pipe(bb)
    })

    await finished

    return res.json({
      files: results,
      message: `Successfully uploaded ${results.length} file(s)`,
    })
  } catch (error: any) {
    console.error("[vendor/uploads] Upload error:", error)
    return res.status(500).json({
      message: "Failed to upload vendor documents",
      error: error?.message || String(error),
    })
  }
}
