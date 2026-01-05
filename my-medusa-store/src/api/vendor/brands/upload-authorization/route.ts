import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import multer from "multer"
import s3Service from "../../../../services/s3-service"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res)
    return res.status(200).end()
}

// Configure multer for file upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Allow PDF, JPG, PNG
        const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'))
        }
    },
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res)
    const auth = await requireApprovedVendor(req, res)
    if (!auth) return

    try {
        // Use multer middleware to parse multipart/form-data
        await new Promise<void>((resolve, reject) => {
            upload.single('file')(req as any, res as any, (err: any) => {
                if (err) reject(err)
                else resolve()
            })
        })

        const file = (req as any).file
        const brandName = (req.body as any).brand_name

        if (!file) {
            return res.status(400).json({
                error: "No file uploaded"
            })
        }

        if (!brandName) {
            return res.status(400).json({
                error: "Missing brand_name"
            })
        }

        // Upload to S3
        const { url, key } = await s3Service.uploadBrandAuthorization(
            auth.vendor_id,
            brandName,
            file.buffer,
            file.originalname,
            file.mimetype
        )

        // Save to database
        const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any

        const authorization = await brandAuthService.upsertBrandAuthorization({
            vendor_id: auth.vendor_id,
            brand_name: brandName,
            authorization_file_url: url,
            authorization_file_key: key,
            metadata: {
                original_filename: file.originalname,
                file_size: file.size,
                mime_type: file.mimetype,
            }
        })

        return res.json({
            success: true,
            authorization: {
                id: authorization.id,
                brand_name: authorization.brand_name,
                file_url: authorization.authorization_file_url,
                uploaded_at: authorization.created_at,
            }
        })
    } catch (error: any) {
        console.error("Upload brand authorization error:", error)
        return res.status(500).json({
            error: error.message || "Failed to upload brand authorization"
        })
    }
}
