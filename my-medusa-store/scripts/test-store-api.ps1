# scripts/test-store-api.ps1
# Test Store API and verify new image paths

$pub = @{ "x-publishable-api-key" = $env:MEDUSA_PUBLISHABLE_KEY }

Write-Host "`n=== Testing Store API ===" -ForegroundColor Cyan
Write-Host "Fetching products..." -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod "http://localhost:9000/store/products?limit=5" -Headers $pub
    
    Write-Host "`nFound $($r.products.Count) products" -ForegroundColor Green
    
    foreach ($p in $r.products) {
        Write-Host "`n----------------------------------------" -ForegroundColor Gray
        Write-Host "Product: $($p.title)" -ForegroundColor Cyan
        Write-Host "ID: $($p.id)" -ForegroundColor Gray
        
        $newPathCount = 0
        $oldPathCount = 0
        
        foreach ($img in $p.images) {
            if ($img.url -match "/opencart/products/") {
                $newPathCount++
                Write-Host "  NEW PATH: $($img.url)" -ForegroundColor Green
            } elseif ($img.url -match "/opencart/") {
                $oldPathCount++
                Write-Host "  OLD PATH: $($img.url)" -ForegroundColor Yellow
            } else {
                Write-Host "  OTHER: $($img.url)" -ForegroundColor Gray
            }
        }
        
        Write-Host "  Summary: $newPathCount new, $oldPathCount old" -ForegroundColor $(if ($newPathCount -gt 0) { "Green" } else { "Red" })
    }
    
    Write-Host "`n=== Summary ===" -ForegroundColor Cyan
    $totalNew = ($r.products | ForEach-Object { $_.images | Where-Object { $_.url -match "/opencart/products/" } }).Count
    $totalOld = ($r.products | ForEach-Object { $_.images | Where-Object { $_.url -match "/opencart/" -and $_.url -notmatch "/opencart/products/" } }).Count
    
    Write-Host "Total images with NEW structure: $totalNew" -ForegroundColor Green
    Write-Host "Total images with OLD structure: $totalOld" -ForegroundColor Yellow
    
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure Medusa server is running on port 9000" -ForegroundColor Yellow
}

