# Migration Script: Neon DB → AWS RDS PostgreSQL
# This script migrates your Medusa database from Neon to AWS RDS

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Medusa DB Migration: Neon → AWS RDS  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$NEON_URL = "postgresql://neondb_owner:npg_wKIOTqyl7i9F@ep-fancy-shape-a1kidvcw-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$AWS_HOST = "oweg-db.cvkyaccgevvb.ap-south-1.rds.amazonaws.com"
$AWS_PORT = "5432"
$AWS_USER = "postgres"
$AWS_DB = "medusa_db"

# Prompt for AWS RDS password
$AWS_PASSWORD = Read-Host "Enter AWS RDS PostgreSQL password" -AsSecureString
$AWS_PASSWORD_PLAIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($AWS_PASSWORD))

Write-Host ""
Write-Host "Step 1: Testing AWS RDS connection..." -ForegroundColor Yellow
$env:PGPASSWORD = $AWS_PASSWORD_PLAIN
$testResult = psql -h $AWS_HOST -p $AWS_PORT -U $AWS_USER -d postgres -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to connect to AWS RDS!" -ForegroundColor Red
    Write-Host $testResult
    exit 1
}
Write-Host "✓ AWS RDS connection successful!" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Creating database '$AWS_DB' on AWS RDS..." -ForegroundColor Yellow
$createDb = psql -h $AWS_HOST -p $AWS_PORT -U $AWS_USER -d postgres -c "CREATE DATABASE $AWS_DB;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database '$AWS_DB' created successfully!" -ForegroundColor Green
} else {
    if ($createDb -like "*already exists*") {
        Write-Host "⚠ Database '$AWS_DB' already exists, continuing..." -ForegroundColor Yellow
    } else {
        Write-Host "✗ Failed to create database!" -ForegroundColor Red
        Write-Host $createDb
        exit 1
    }
}

Write-Host ""
Write-Host "Step 3: Dumping data from Neon DB..." -ForegroundColor Yellow
$dumpFile = "medusa_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
pg_dump "$NEON_URL" -f $dumpFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to dump Neon database!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Database dumped to: $dumpFile" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Restoring data to AWS RDS..." -ForegroundColor Yellow
$env:PGPASSWORD = $AWS_PASSWORD_PLAIN
psql -h $AWS_HOST -p $AWS_PORT -U $AWS_USER -d $AWS_DB -f $dumpFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to restore to AWS RDS!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Database restored successfully!" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Verifying migration..." -ForegroundColor Yellow
$tableCount = psql -h $AWS_HOST -p $AWS_PORT -U $AWS_USER -d $AWS_DB -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
Write-Host "✓ Found $($tableCount.Trim()) tables in AWS RDS" -ForegroundColor Green

$productCount = psql -h $AWS_HOST -p $AWS_PORT -U $AWS_USER -d $AWS_DB -t -c "SELECT COUNT(*) FROM product;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Found $($productCount.Trim()) products" -ForegroundColor Green
} else {
    Write-Host "⚠ Could not count products (table may not exist yet)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Migration Complete!                   " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update your .env file with the new DATABASE_URL"
Write-Host "2. Replace YOUR_PASSWORD with your actual AWS RDS password"
Write-Host "3. Restart your Medusa server: npm run dev"
Write-Host ""
Write-Host "New DATABASE_URL:" -ForegroundColor Cyan
Write-Host "DATABASE_URL=postgresql://$AWS_USER:YOUR_PASSWORD@$AWS_HOST`:$AWS_PORT/$AWS_DB`?sslmode=require"
Write-Host ""
Write-Host "Backup file saved as: $dumpFile" -ForegroundColor Green

