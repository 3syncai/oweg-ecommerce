# S3 Image Key Restructure - Complete Guide

## ✅ What Was Done

### 1. **Smoke Tests** ✓
Verified that the new S3 structure exists and old structure is inaccessible:
- **NEW**: `200 OK` - Images accessible at `/opencart/products/<brand>/<product-slug>-<id>/images/`
- **OLD**: `403 Forbidden` - Old flat structure no longer accessible

### 2. **Code Updates** ✓
Updated the ETL system to use structured S3 keys for future migrations:

#### Created Files:
- `src/etl/s3-keys.ts` - Utility functions for building structured S3 keys
- `scripts/publish-and-attach.ps1` - Publish draft products and attach to sales channel
- `scripts/test-store-api.ps1` - Verify image paths in Store API

#### Modified Files:
- `src/etl/image-pipeline.ts` - Updated to use structured keys with product context
- `src/etl/migration.ts` - Set product context before processing images

### 3. **New S3 Key Structure**
```
OLD: opencart/oc_product_image_51_0.jpg
NEW: opencart/products/pigeon/pigeon-deluxe-aluminium-outer-lid-pressure-cooker-51/images/oc_product_image_51_0.jpg
```

**Format**: `opencart/products/<brand-slug>/<product-slug>-<productId>/images/<image-name>`

---

## 🚀 Next Steps

### Step 1: Start Medusa Server (if not running)
```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store
npm run dev
```

### Step 2: Publish & Attach Products to Sales Channel
```powershell
.\scripts\publish-and-attach.ps1
```

This will:
- Find the default sales channel
- Publish all draft products
- Attach all products to the sales channel

### Step 3: Verify Store API (Check Image Paths)
```powershell
.\scripts\test-store-api.ps1
```

This will show:
- How many products have NEW structured paths
- How many products have OLD flat paths
- Sample URLs for verification

### Step 4: Run New Migration (Future Products)
All future migrations will automatically use the new structured S3 keys:

```powershell
# Start ETL server (if not running)
npm run etl:server

# In another terminal, migrate products
node scripts/run-migration.js 5
```

New products will have images stored as:
```
opencart/products/<brand-slug>/<product-slug>-<productId>/images/<image-name>
```

---

## 📊 Verification Commands

### Check S3 Image Accessibility
```powershell
# Test NEW structure (should return 200)
$new = "https://oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com/opencart/products/generic/pigeon-deluxe-aluminium-outer-lid-pressure-cooker-3-liters-silver-51-51/images/oc_product_image_51_0.jpg"
Invoke-WebRequest -UseBasicParsing -Method Head -Uri $new | % { "NEW -> $($_.StatusCode)" }

# Test OLD structure (should return 403 or 404)
$old = "https://oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com/opencart/oc_product_image_51_0.jpg"
try { Invoke-WebRequest -UseBasicParsing -Method Head -Uri $old } catch { "OLD -> $($_.Exception.Response.StatusCode.value__)" }
```

### Check Product Status in Admin API
```powershell
$base = "http://localhost:9000"
$hAdm = @{ Authorization = "Basic $env:MEDUSA_ADMIN_BASIC" }
$products = (Invoke-RestMethod "$base/admin/products?limit=100" -Headers $hAdm).products

Write-Host "Total products: $($products.Count)"
Write-Host "Published: $(($products | Where-Object { $_.status -eq 'published' }).Count)"
Write-Host "Draft: $(($products | Where-Object { $_.status -eq 'draft' }).Count)"
```

---

## 🔧 How It Works

### Image Pipeline Flow (New)

1. **Migration starts** → Creates `ImagePipeline` with empty context
2. **For each product** → Calls `setProductContext()` with:
   - `brandName`: Manufacturer name (e.g., "Pigeon")
   - `productName`: Product title (e.g., "Pigeon Deluxe Aluminium Outer Lid Pressure Cooker")
   - `productId`: OpenCart product ID (e.g., 51)
3. **Process images** → `buildBrandProductImageKey()` generates structured key:
   ```typescript
   opencart/products/pigeon/pigeon-deluxe-aluminium-outer-lid-pressure-cooker-51/images/oc_product_image_51_0.jpg
   ```
4. **Upload to S3** → Image stored with structured key
5. **Return S3 URL** → Full URL returned to Medusa

### Key Functions

#### `buildBrandProductImageKey()` (src/etl/s3-keys.ts)
```typescript
buildBrandProductImageKey({
  brandName: "Pigeon",
  productName: "Pigeon Deluxe Aluminium Outer Lid Pressure Cooker",
  productId: 51,
  originalName: "https://www.oweg.in/image/cache/catalog/pigeon/cooker.jpg"
})
// Returns: "opencart/products/pigeon/pigeon-deluxe-aluminium-outer-lid-pressure-cooker-51/images/cooker.jpg"
```

#### `setProductContext()` (src/etl/image-pipeline.ts)
```typescript
context.imagePipeline.setProductContext({
  brandName: product.manufacturer_name,
  productName: product.name,
  productId: product.product_id,
});
```

---

## 📝 Benefits of New Structure

### ✅ Advantages:
1. **Better Organization**: Images grouped by brand and product
2. **Human Readable**: Easy to find images in S3 console
3. **Collision Prevention**: Product-specific folders prevent naming conflicts
4. **Easier Debugging**: Clear path structure shows what product images belong to
5. **Future-Proof**: Scalable structure for thousands of products

### Example Comparison:

**OLD (Flat)**:
```
opencart/
├── oc_product_image_51_0.jpg
├── oc_product_image_51_1.jpg
├── oc_product_image_52_0.jpg
├── oc_product_image_53_0.jpg
└── ... (thousands of files in one folder)
```

**NEW (Hierarchical)**:
```
opencart/products/
├── pigeon/
│   ├── pigeon-deluxe-aluminium-outer-lid-pressure-cooker-51/
│   │   └── images/
│   │       ├── oc_product_image_51_0.jpg
│   │       └── oc_product_image_51_1.jpg
│   └── pigeon-pressure-cooker-3l-52/
│       └── images/
│           └── oc_product_image_52_0.jpg
└── prestige/
    └── prestige-induction-cooktop-53/
        └── images/
            └── oc_product_image_53_0.jpg
```

---

## 🎯 Summary

✅ **Completed**:
- Created structured S3 key builder
- Updated image pipeline to use new structure
- Set product context during migration
- Created helper scripts for publishing and verification

✅ **Verified**:
- New S3 paths are accessible (200 OK)
- Old S3 paths are blocked (403 Forbidden)

🚀 **Ready**:
- All future migrations will use new structure
- Existing products can be verified with test scripts
- No manual intervention needed for new products

---

## 🛠️ Troubleshooting

### Images not showing in frontend?
1. Check `next.config.ts` has S3 domain in `remotePatterns`
2. Verify images are accessible via direct S3 URL
3. Check browser console for CORS errors

### Products still in draft?
Run: `.\scripts\publish-and-attach.ps1`

### Store API not returning products?
1. Ensure products are published
2. Ensure products are attached to sales channel
3. Check `MEDUSA_PUBLISHABLE_KEY` is set correctly

---

## 📞 Support

If you encounter issues:
1. Check Medusa server logs: `npm run dev`
2. Check ETL server logs: `npm run etl:server`
3. Verify environment variables in `.env`
4. Test S3 access with smoke test commands above

