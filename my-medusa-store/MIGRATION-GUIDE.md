# 🚀 Complete OpenCart to Medusa Migration Guide

This guide will help you migrate **ALL products** from OpenCart to Medusa with complete data.

## 📋 What Gets Migrated

✅ **Product Information:**
- Title, Description, Handle
- SKU, Model Number
- Status (Published)
- Thumbnail & Multiple Images

✅ **Pricing:**
- Prices in INR (whole rupees)
- Regular prices
- Special/Sale prices
- Discount percentages

✅ **Inventory:**
- Stock quantities from OpenCart
- Linked to default location
- Inventory items created for each variant

✅ **Product Organization:**
- Categories (hierarchical structure)
- Tags
- Collections (by brand)
- Product Types

✅ **Product Attributes:**
- Dimensions (Length, Width, Height in cm)
- Weight (in kg)
- MID Code (from MPN/Model)
- HS Code (from UPC)
- Material
- Country of Origin

✅ **Images:**
- Uploaded to AWS S3
- Multiple images per product
- Proper ordering

✅ **Sales Channels:**
- Assigned to default sales channel

---

## 🎯 Prerequisites

### 1. Servers Must Be Running

**Terminal 1 - Medusa Server:**
```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store
npm run dev
```
Wait until you see: `✔ Server is ready on port: 9000`

**Terminal 2 - ETL Server:**
```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store
npm run etl:server
```
Wait until you see: `ETL server listening on port 7070`

### 2. Environment Variables

Make sure your `.env` file has:
- ✅ `MEDUSA_URL=http://localhost:9000`
- ✅ `MEDUSA_ADMIN_BASIC=<your-admin-key>`
- ✅ `MEDUSA_DRY_RUN=false`
- ✅ `RESEED=true`
- ✅ AWS S3 credentials configured
- ✅ OpenCart MySQL connection details

---

## 🚀 Migration Steps

### Option 1: Automated (Recommended)

**Terminal 3:**
```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store
.\scripts\migrate-all.ps1
```

This script will:
1. Flush existing products
2. Migrate ALL products from OpenCart
3. Fix inventory stock levels
4. Publish all products
5. Show verification summary

### Option 2: Manual Step-by-Step

**Terminal 3:**
```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store

# Step 1: Flush existing data
node scripts/medusa-flush.js

# Step 2: Migrate all products (999999 = all)
node scripts/run-migration.js 999999

# Step 3: Fix inventory stock levels
node scripts/fix-all-inventory.js

# Step 4: Publish all products
node scripts/publish-products.js

# Step 5: Verify
node scripts/verify-migration.js
```

---

## 📊 Monitoring Progress

During migration, you'll see:
- `Initializing migration` - Setting up
- `Processed product XX` - Each product being migrated
- `Migration complete` - All done

The migration logs are saved in:
```
logs/opencart-etl/
```

---

## ✅ Verification

After migration, check:

### 1. Medusa Admin UI
Open: http://localhost:9000/app

**Check Products:**
- Status should be "Published"
- Images should load
- Prices in INR (whole rupees)

**Check Inventory:**
- Go to Inventory section
- Stock levels should match OpenCart
- Location should be "Mumbai Warehouse"

**Check Categories:**
- Hierarchical structure preserved
- Parent → Child relationships

### 2. Command Line Verification
```powershell
node scripts/check-products.js
```

Should show:
- Status: published ✅
- Stock Levels: matching OpenCart ✅

---

## 🔧 Troubleshooting

### Issue: "Missing MEDUSA_ADMIN_BASIC env var"
**Solution:** Make sure `.env` has `MEDUSA_ADMIN_BASIC` set

### Issue: "Error: Error" or connection refused
**Solution:** Make sure both servers are running (ports 9000 and 7070)

### Issue: Products created but no stock levels
**Solution:** Run the inventory fix:
```powershell
node scripts/fix-all-inventory.js
```

### Issue: Products in draft status
**Solution:** Run the publish script:
```powershell
node scripts/publish-products.js
```

### Issue: Images not showing
**Solution:** Check AWS S3 credentials in `.env`:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_BUCKET`

---

## 📝 Migration Checklist

Before migration:
- [ ] Medusa server running (port 9000)
- [ ] ETL server running (port 7070)
- [ ] `.env` file configured
- [ ] AWS S3 bucket accessible
- [ ] OpenCart database accessible

After migration:
- [ ] Products count matches OpenCart
- [ ] All products are "Published"
- [ ] Inventory stock levels correct
- [ ] Images loading from S3
- [ ] Categories created
- [ ] Collections created
- [ ] Tags created

---

## 🎯 Expected Results

For a typical OpenCart store with 100 products:
- **Products:** 100 published products
- **Inventory Items:** 100 inventory items with stock levels
- **Categories:** 10-20 categories (hierarchical)
- **Collections:** 5-15 collections (by brand)
- **Tags:** 50-100 tags
- **Images:** 300-500 images uploaded to S3

---

## 💡 Tips

1. **Start Small:** Test with 2-5 products first
   ```powershell
   node scripts/run-migration.js 5
   ```

2. **Monitor Logs:** Check `logs/opencart-etl/` for detailed logs

3. **Incremental Migration:** You can run migration multiple times
   - Set `RESEED=true` to replace existing products
   - Set `RESEED=false` to skip existing products

4. **Backup First:** Always backup your Medusa database before full migration

---

## 🆘 Support

If you encounter issues:
1. Check the logs in `logs/opencart-etl/`
2. Verify both servers are running
3. Check `.env` configuration
4. Run verification script: `node scripts/verify-migration.js`

---

## ✨ Post-Migration

After successful migration:
1. Test the storefront
2. Verify checkout flow
3. Test inventory updates
4. Check product search
5. Verify category navigation

---

**Happy Migrating! 🚀**

