import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import multer from "multer"
import s3Service from "../../../../services/s3-service"
import { loadShareProduct, validProductShare } from "../../../../lib/product-share"

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
        // Allow PDF, JPG, PNG, DOC, DOCX
        const allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]
        // Some browsers/OS combinations don't set a mime-type for .doc/.docx
        // (especially when the file comes from a drag-and-drop in Safari).
        // Fall back to the file extension in that case.
        const fallbackByExt = /\.(pdf|jpe?g|png|docx?|DOCX?)$/i.test(
            file.originalname || ""
        )

        if (allowedMimes.includes(file.mimetype) || fallbackByExt) {
            cb(null, true)
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.'))
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

        const sharedProductId = String((req.body as any).shared_product_id || "")
        let sharedProduct: any = null
        if (sharedProductId) {
            sharedProduct = await loadShareProduct(req.scope, sharedProductId)
            if (!validProductShare(sharedProduct, (req.body as any).share_token)) {
                return res.status(404).json({ message: "Shared product link expired. Ask the admin for a new link." })
            }
            if (String(sharedProduct.metadata?.brand || "UNBRANDED").trim().toLowerCase() !== String(brandName).trim().toLowerCase()) {
                return res.status(409).json({ message: "The uploaded letter must match the shared product brand." })
            }
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
                ...(sharedProduct ? {
                    shared_product_id: sharedProduct.id,
                    shared_product_share_hash: sharedProduct.metadata.catalog_share_hash,
                } : {}),
            }
        })

        return res.json({
            success: true,
            authorization: {
                id: authorization.id,
                brand_name: authorization.brand_name,
                file_url: authorization.authorization_file_url,
                file_key: authorization.authorization_file_key,
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
