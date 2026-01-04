import { model } from "@medusajs/framework/utils"

const VendorBrandAuthorization = model.define("vendor_brand_authorization", {
    id: model.id().primaryKey(),

    // Foreign key to vendor
    vendor_id: model.text().index(),

    // Brand name (case-insensitive, normalized)
    brand_name: model.text().index(),

    // Cloud storage details
    authorization_file_url: model.text(),
    authorization_file_key: model.text(), // S3 object key for deletion

    // Verification status
    verified: model.boolean().default(false),
    verified_at: model.dateTime().nullable(),
    verified_by: model.text().nullable(), // Admin user ID

    // Metadata
    metadata: model.json().nullable(),
})
    .indexes([
        {
            on: ["vendor_id", "brand_name"],
            unique: true,
        },
    ])

export default VendorBrandAuthorization
