import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import Busboy from "busboy"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
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

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

function getS3Config() {
  const config = {
    s3Region: process.env.S3_REGION?.trim() || "",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
    s3Bucket: process.env.S3_BUCKET?.trim() || "",
  }

  console.log('=== S3 Configuration Debug ===')
  console.log('S3_REGION:', config.s3Region)
  console.log('S3_BUCKET:', config.s3Bucket)
  console.log('S3_ACCESS_KEY_ID:', config.s3AccessKeyId ? `${config.s3AccessKeyId.substring(0, 10)}...` : 'NOT SET')
  console.log('S3_SECRET_ACCESS_KEY:', config.s3SecretAccessKey ? 'SET (hidden)' : 'NOT SET')
  console.log('==============================')

  return config
}

function sanitizeForPath(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'user'
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)

    // Check if it's multipart/form-data
    const contentType = (req.headers['content-type'] || '').toLowerCase()
    const isMultipart = contentType.includes('multipart/form-data')

    let formData: any = {}
    let uploadedFiles: { aadhar_card_photo?: string; pan_card_photo?: string } = {}

    if (isMultipart) {
      // Handle multipart/form-data with file uploads
      const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config()
      const s3FileUrl = process.env.S3_FILE_URL || `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`

      let s3Client: S3Client | null = null
      if (s3Bucket && s3AccessKeyId && s3SecretAccessKey && s3Region) {
        s3Client = new S3Client({
          region: s3Region,
          credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          },
        })
      }

      const headers = (req as any).headers || {}
      const bb = Busboy({ headers })
      const filePromises: Promise<void>[] = []
      let userName = ''
      let userEmail = ''

      await new Promise<void>((resolve, reject) => {
        bb.on("field", (name: string, value: string) => {
          if (name === "is_agent" || name === "agree_to_policy") {
            formData[name] = value === "true"
          } else {
            formData[name] = value
          }
          if (name === "first_name" || name === "last_name") {
            userName = (userName ? userName + " " : "") + value
          }
          if (name === "email") {
            userEmail = value
          }
        })

        bb.on("file", (name: string, file: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
          if (name === "aadhar_card_photo" || name === "pan_card_photo") {
            const filePromise = (async () => {
              // Skip upload if S3 is not configured
              if (!s3Client || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
                console.warn(`S3 not properly configured, skipping ${name} upload`)
                // Drain the file stream to prevent hanging
                file.resume()
                return
              }

              const filename = (info.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
              const extension = path.extname(filename) || '.png'
              const uniqueId = randomUUID().substring(0, 8)
              const imageFilename = `${uniqueId}${extension}`

              const sanitizedName = sanitizeForPath(userName || userEmail || "user")
              const s3Key = `affiliate/users/${sanitizedName}/documents/${name}/${imageFilename}`

              const fileChunks: Buffer[] = []
              file.on("data", (chunk: Buffer) => fileChunks.push(chunk))

              await new Promise<void>((fileResolve, fileReject) => {
                file.on("end", async () => {
                  try {
                    const fileBuffer = Buffer.concat(fileChunks)
                    const command = new PutObjectCommand({
                      Bucket: s3Bucket!,
                      Key: s3Key,
                      Body: fileBuffer,
                      ContentType: info.mimeType || "image/png",
                    })

                    await s3Client!.send(command)
                    const fileUrl = `${s3FileUrl}/${s3Key}`
                    uploadedFiles[name as keyof typeof uploadedFiles] = fileUrl
                    console.log(`Successfully uploaded ${name} to S3`)
                    fileResolve()
                  } catch (err) {
                    console.error(`Error uploading ${name}:`, err)
                    // Don't reject - just log and continue without file
                    console.warn(`Continuing registration without ${name}`)
                    fileResolve()
                  }
                })
                file.on("error", (err) => {
                  console.error(`File stream error for ${name}:`, err)
                  fileResolve() // Resolve instead of reject
                })
              })
            })()
            filePromises.push(filePromise)
          }
        })

        bb.on("finish", () => {
          Promise.all(filePromises)
            .then(() => resolve())
            .catch(reject)
        })

        bb.on("error", reject)
          ; (req as any).pipe(bb)
      })
    } else {
      // Handle JSON body
      formData = req.body as any || {}
    }

    const {
      first_name,
      last_name,
      email,
      password,
      confirm_password,
      phone,
      refer_code,
      entry_sponsor,
      is_agent,
      gender,
      father_name,
      mother_name,
      birth_date,
      qualification,
      marital_status,
      blood_group,
      emergency_person_name,
      emergency_person_mobile,
      aadhar_card_no,
      pan_card_no,
      designation,
      sales_target,
      branch,
      area,
      state,
      payment_method,
      bank_name,
      bank_branch,
      ifsc_code,
      account_name,
      account_number,
      address_1,
      address_2,
      city,
      pin_code,
      country,
      address_state,
    } = formData

    // Validate required fields
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        message: "First name, last name, email, and password are required",
      })
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        message: "Passwords do not match",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      })
    }

    // Create affiliate user
    const affiliateUser = await affiliateService.createAffiliateUser({
      first_name,
      last_name,
      email,
      password,
      phone: phone || null,
      refer_code: refer_code || null,
      entry_sponsor: entry_sponsor || null,
      is_agent: is_agent || false,
      gender: gender || null,
      father_name: father_name || null,
      mother_name: mother_name || null,
      birth_date: birth_date || null,
      qualification: qualification || null,
      marital_status: marital_status || null,
      blood_group: blood_group || null,
      emergency_person_name: emergency_person_name || null,
      emergency_person_mobile: emergency_person_mobile || null,
      aadhar_card_no: aadhar_card_no || null,
      pan_card_no: pan_card_no || null,
      aadhar_card_photo: uploadedFiles.aadhar_card_photo || null,
      pan_card_photo: uploadedFiles.pan_card_photo || null,
      designation: designation || null,
      sales_target: sales_target || null,
      branch: branch || null,
      area: area || null,
      state: state || null,
      payment_method: payment_method || null,
      bank_name: bank_name || null,
      bank_branch: bank_branch || null,
      ifsc_code: ifsc_code || null,
      account_name: account_name || null,
      account_number: account_number || null,
      address_1: address_1 || null,
      address_2: address_2 || null,
      city: city || null,
      pin_code: pin_code || null,
      country: country || null,
      address_state: address_state || null,
    })

    // Remove password_hash from response
    const { password_hash, ...sanitizedUser } = affiliateUser

    return res.json({
      user: sanitizedUser,
      message: "Affiliate user created successfully. Your application is pending verification.",
    })
  } catch (error: any) {
    console.error("Affiliate registration error:", error)

    if (error.type === "DUPLICATE_ERROR") {
      return res.status(409).json({
        message: error.message || "Email already exists",
      })
    }

    return res.status(500).json({
      message: "Failed to create affiliate user",
      error: error?.message || String(error),
    })
  }
}
