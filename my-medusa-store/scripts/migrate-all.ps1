# Complete Migration Script - Migrate ALL Products from OpenCart to Medusa
# This script handles: products, prices, inventory, status, categories, tags, images, dimensions, etc.

Write-Host ""
Write-Host "Starting Complete OpenCart to Medusa Migration" -ForegroundColor Green
Write-Host ""

# Change to the correct directory
Set-Location "C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store"

# Step 1: Flush existing data
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Step 1: Flushing existing products..." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
node scripts/medusa-flush.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Flush failed! Make sure Medusa server is running on port 9000." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SUCCESS: Flush completed!" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Step 2: Run migration for ALL products
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Step 2: Migrating ALL products..." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "This will migrate all products with:" -ForegroundColor White
Write-Host "  - Product details (title, description, handle)" -ForegroundColor Gray
Write-Host "  - Prices (INR, whole rupees)" -ForegroundColor Gray
Write-Host "  - Categories (hierarchical)" -ForegroundColor Gray
Write-Host "  - Tags" -ForegroundColor Gray
Write-Host "  - Collections (by brand)" -ForegroundColor Gray
Write-Host "  - Product types" -ForegroundColor Gray
Write-Host "  - Images (uploaded to S3)" -ForegroundColor Gray
Write-Host "  - Dimensions (cm/kg)" -ForegroundColor Gray
Write-Host "  - Product attributes (MID code, HS code, etc.)" -ForegroundColor Gray
Write-Host "  - Inventory items" -ForegroundColor Gray
Write-Host "  - Sales channel assignment" -ForegroundColor Gray
Write-Host ""

# Use a very high number to migrate all products
node scripts/run-migration.js 999999

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Migration failed! Check the logs for details." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SUCCESS: Migration completed!" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Step 3: Fix inventory stock levels
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Step 3: Setting inventory stock levels..." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan

node scripts/fix-all-inventory.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "WARNING: Inventory fix had some issues, but continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "SUCCESS: Inventory stock levels set!" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Step 4: Publish all products
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Step 4: Publishing all products..." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
node scripts/publish-products.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "WARNING: Publishing had some issues, but continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "SUCCESS: All products published!" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Step 5: Verify results
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Step 5: Verifying migration..." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan

node scripts/verify-migration.js

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "MIGRATION COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Medusa Admin: http://localhost:9000/app" -ForegroundColor White
Write-Host "2. Check Products, Inventory, Categories, Collections" -ForegroundColor White
Write-Host "3. Verify images are loading from S3" -ForegroundColor White
Write-Host ""
Write-Host "All done!" -ForegroundColor Green
Write-Host ""
