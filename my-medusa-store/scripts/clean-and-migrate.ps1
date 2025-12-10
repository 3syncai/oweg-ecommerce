# Clean and migrate script
Write-Host "=== Clean and Migrate ===" -ForegroundColor Cyan

# Set environment variables
$env:MEDUSA_ADMIN_BASIC = $env:MEDUSA_ADMIN_API_KEY
$env:MEDUSA_URL = "http://localhost:9000"
$env:RESEED = "true"

# Step 1: Delete all products
Write-Host "`n1. Deleting all existing products..." -ForegroundColor Yellow
node scripts\medusa-flush.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to delete products" -ForegroundColor Red
    exit 1
}

# Step 2: Run migration
Write-Host "`n2. Running migration (2 products)..." -ForegroundColor Yellow
node scripts\run-migration.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed" -ForegroundColor Red
    exit 1
}

# Step 3: Fix inventory and dimensions
Write-Host "`n3. Fixing inventory and dimensions..." -ForegroundColor Yellow
node scripts\fix-inventory-dims.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "Fix failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Refresh the Medusa Admin UI to see the updated products" -ForegroundColor Cyan

