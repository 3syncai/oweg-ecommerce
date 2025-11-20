# Vendor Product Approval Workflow

## Overview
Complete implementation of vendor product submission with AWS image upload, pending approval status, and admin review system.

## Features Implemented

### 1. **Vendor Product Creation with AWS Upload**
- Vendors can create products with images
- Images are uploaded to AWS S3
- Products are automatically set to "pending" status
- Currency changed from EUR (€) to INR (₹)

### 2. **Pending Approval Status**
- All vendor-submitted products start with `approval_status: "pending"`
- Products remain in DRAFT status until approved
- Metadata tracks:
  - `vendor_id` - Which vendor created the product
  - `approval_status` - pending/approved/rejected
  - `submitted_at` - Timestamp of submission

### 3. **Admin Review Extension**
- Widget appears on admin products page
- Shows all pending vendor products
- Admin can:
  - View product details
  - Edit product before approval
  - Approve product (sets to PUBLISHED)
  - Reject product (sets to REJECTED)

## Files Created/Modified

### Frontend (Vendor Side)

#### `src/admin/routes/vendor/products/new/page.tsx`
**Changes:**
- Changed currency from EUR (€) to INR (₹)
- Added proper form data structure for product creation
- Includes image upload functionality
- 3-step wizard: Details → Organize → Variants

**Key Features:**
- Title, Subtitle, Handle, Description
- Media upload (images)
- Discountable toggle
- Type, Collection, Categories, Tags
- Shipping profile, Sales channels
- Variant table with INR pricing

### Backend APIs

#### `src/api/vendor/products/route.ts`
**POST Endpoint - Create Product**
```typescript
POST /vendor/products
```

**Features:**
- Accepts product data from vendor
- Sets `approval_status: "pending"` in metadata
- Sets `status: ProductStatus.DRAFT`
- Stores `vendor_id`, `submitted_at` in metadata
- Returns created product

**Request Body:**
```json
{
  "title": "Product Name",
  "subtitle": "Product Subtitle",
  "description": "Product Description",
  "handle": "product-handle",
  "category_ids": ["cat_123"],
  "collection_id": "col_123",
  "tags": ["tag1", "tag2"],
  "images": ["url1", "url2"],
  "variants": [...],
  "discountable": true
}
```

#### `src/api/vendor/products/upload-image/route.ts`
**POST Endpoint - Upload Images to AWS**
```typescript
POST /vendor/products/upload-image
```

**Features:**
- Accepts multipart/form-data files
- Uploads to AWS S3 using Medusa file service
- Returns array of uploaded file URLs
- Requires vendor authentication

**Response:**
```json
{
  "files": [
    {
      "url": "https://s3.amazonaws.com/...",
      "key": "file-key"
    }
  ]
}
```

### Admin Extension

#### `src/admin/widgets/vendor-products-widget.tsx`
**Widget Configuration:**
- Zone: `product.list.before`
- Displays above product list in admin

**Features:**
- Lists all pending vendor products
- Shows product thumbnail, title, subtitle
- Displays submission date
- Action buttons: View, Edit, Approve

**View Mode:**
- Full product details
- Product images
- Description
- Vendor information
- Submission timestamp
- Actions: Edit, Approve, Reject

### Admin APIs

#### `src/api/admin/custom/vendor-products/pending/route.ts`
**GET Endpoint - List Pending Products**
```typescript
GET /admin/custom/vendor-products/pending
```

**Features:**
- Returns all products with `approval_status: "pending"`
- Includes full product data
- Requires admin authentication

**Response:**
```json
{
  "products": [
    {
      "id": "prod_123",
      "title": "Product Name",
      "status": "draft",
      "metadata": {
        "vendor_id": "vendor_123",
        "approval_status": "pending",
        "submitted_at": "2024-01-01T00:00:00Z"
      }
    }
  ]
}
```

#### `src/api/admin/custom/vendor-products/[id]/approve/route.ts`
**POST Endpoint - Approve Product**
```typescript
POST /admin/custom/vendor-products/:id/approve
```

**Features:**
- Changes product status to PUBLISHED
- Updates metadata:
  - `approval_status: "approved"`
  - `approved_at: timestamp`
  - `approved_by: "admin"`
- Product becomes visible in storefront

#### `src/api/admin/custom/vendor-products/[id]/reject/route.ts`
**POST Endpoint - Reject Product**
```typescript
POST /admin/custom/vendor-products/:id/reject
```

**Features:**
- Changes product status to REJECTED
- Updates metadata:
  - `approval_status: "rejected"`
  - `rejected_at: timestamp`
  - `rejected_by: "admin"`
- Product remains hidden from storefront

## Workflow

### Vendor Workflow

1. **Login as Vendor**
   - Navigate to `/app/vendor/products`
   - Click "Add Product" button

2. **Step 1: Details**
   - Enter title (required)
   - Add subtitle, handle, description
   - Upload images (stored in AWS S3)
   - Click "Continue"

3. **Step 2: Organize**
   - Toggle discountable
   - Select type, collection
   - Choose categories (dropdown)
   - Add tags
   - Set shipping profile
   - Manage sales channels
   - Click "Continue"

4. **Step 3: Variants**
   - Configure default variant
   - Set title, SKU
   - Enable managed inventory, backorder, inventory kit
   - Set price in INR (₹)
   - Click "Publish"

5. **Product Submitted**
   - Product created with `approval_status: "pending"`
   - Status set to DRAFT
   - Awaits admin approval

### Admin Workflow

1. **View Pending Products**
   - Login as Admin
   - Navigate to Products page
   - See "Vendor Products Pending Approval" widget at top

2. **Review Product**
   - Click "View" to see full details
   - Review:
     - Product title, subtitle, description
     - Images
     - Vendor information
     - Submission date

3. **Edit (Optional)**
   - Click "Edit Product"
   - Make any necessary changes
   - Customize product details
   - Save changes

4. **Approve or Reject**
   - **Approve**: Click "Approve" button
     - Product status → PUBLISHED
     - Product visible in storefront
     - Vendor notified (if notification system exists)
   
   - **Reject**: Click "Reject" button
     - Product status → REJECTED
     - Product hidden from storefront
     - Vendor can see rejection (if implemented)

## Database Schema

### Product Metadata Structure
```json
{
  "vendor_id": "vendor_123",
  "approval_status": "pending|approved|rejected",
  "submitted_at": "2024-01-01T00:00:00Z",
  "approved_at": "2024-01-02T00:00:00Z",
  "approved_by": "admin_123",
  "rejected_at": "2024-01-02T00:00:00Z",
  "rejected_by": "admin_123"
}
```

## Currency Configuration

### Changed from EUR to INR
- **Frontend Display**: ₹ (Rupee symbol)
- **Label**: "Price INR" instead of "Price EUR"
- **Input**: Numeric input with ₹ prefix

## AWS S3 Configuration

### Image Upload
- Uses Medusa's built-in file service
- Configured in `medusa-config.ts`
- S3 bucket settings:
  - Bucket name
  - Region
  - Access key ID
  - Secret access key
  - Public URL for viewing

### File Service Configuration
```typescript
{
  resolve: "@medusajs/file",
  options: {
    default: "s3",
    providers: [
      {
        resolve: "@medusajs/file-s3",
        id: "s3",
        options: {
          bucket: process.env.S3_BUCKET,
          region: process.env.S3_REGION,
          access_key_id: process.env.S3_ACCESS_KEY_ID,
          secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
          file_url: process.env.S3_FILE_URL,
        },
      },
    ],
  },
}
```

## Security

### Vendor Authentication
- All vendor endpoints require `vendor_token`
- Token verified via `requireVendorAuth()` guard
- Vendor ID stored in product metadata

### Admin Authentication
- Admin endpoints use Medusa's built-in admin auth
- Credentials passed via cookies
- Session-based authentication

## Future Enhancements

### Potential Additions:
1. **Email Notifications**
   - Notify vendor when product is approved/rejected
   - Notify admin when new product is submitted

2. **Rejection Reasons**
   - Admin can provide feedback on rejection
   - Vendor can see why product was rejected

3. **Product Versioning**
   - Track changes made by admin
   - Show diff between vendor submission and admin edits

4. **Bulk Actions**
   - Approve/reject multiple products at once
   - Export pending products list

5. **Analytics**
   - Track approval rates
   - Average time to approval
   - Vendor performance metrics

6. **Image Optimization**
   - Automatic image compression
   - Multiple image sizes (thumbnail, full)
   - WebP conversion

7. **Product Categories**
   - Vendor-specific categories
   - Auto-categorization suggestions

## Testing

### Test Vendor Product Creation:
1. Login as vendor
2. Create product with all details
3. Upload images
4. Submit product
5. Verify product appears in vendor's product list with "Pending" status

### Test Admin Approval:
1. Login as admin
2. Navigate to Products page
3. See pending products widget
4. Click "View" on a product
5. Click "Approve"
6. Verify product status changes to PUBLISHED

### Test Admin Rejection:
1. Login as admin
2. View pending product
3. Click "Reject"
4. Verify product status changes to REJECTED

## Troubleshooting

### Images Not Uploading
- Check S3 credentials in `.env`
- Verify bucket permissions
- Check CORS settings on S3 bucket

### Products Not Appearing in Admin
- Verify `approval_status` is set to "pending"
- Check admin API endpoint is accessible
- Verify widget is registered correctly

### Approval Not Working
- Check admin authentication
- Verify product ID is correct
- Check product update permissions

## API Reference

### Vendor Endpoints
```
POST   /vendor/products              - Create product
GET    /vendor/products              - List vendor products
POST   /vendor/products/upload-image - Upload images to AWS
GET    /vendor/products/:id          - Get product details
PUT    /vendor/products/:id          - Update product
DELETE /vendor/products/:id          - Delete product
```

### Admin Endpoints
```
GET  /admin/custom/vendor-products/pending     - List pending products
POST /admin/custom/vendor-products/:id/approve - Approve product
POST /admin/custom/vendor-products/:id/reject  - Reject product
```

## Conclusion

This implementation provides a complete vendor product approval workflow with:
- ✅ AWS S3 image upload
- ✅ Pending approval status
- ✅ Admin review interface
- ✅ Edit before approval
- ✅ Approve/reject functionality
- ✅ INR currency support
- ✅ Metadata tracking
- ✅ Secure authentication

All products submitted by vendors now require admin approval before being published to the storefront!

