# scripts/publish-and-attach.ps1
# Publish all draft products and attach them to the default sales channel

$base = "http://localhost:9000"
$hAdm = @{ 
    Authorization = "Basic $env:MEDUSA_ADMIN_BASIC"
    "Content-Type" = "application/json"
}

Write-Host "`n=== Getting default sales channel ===" -ForegroundColor Cyan
$sc = (Invoke-RestMethod "$base/admin/sales-channels?limit=50" -Headers $hAdm).sales_channels | 
      Where-Object is_default | Select-Object -First 1

if (-not $sc) { 
    $sc = (Invoke-RestMethod "$base/admin/sales-channels?limit=1" -Headers $hAdm).sales_channels[0] 
}

Write-Host "Sales Channel: $($sc.name) (ID: $($sc.id))" -ForegroundColor Green

Write-Host "`n=== Fetching ALL products ===" -ForegroundColor Cyan
$allProducts = @()
$offset = 0
$limit = 100

# Fetch all products in batches
do {
    $page = Invoke-RestMethod "$base/admin/products?limit=$limit&offset=$offset" -Headers $hAdm
    $products = $page.products
    if ($products.Count -gt 0) {
        $allProducts += $products
        $offset += $limit
        Write-Host "  Fetched $($allProducts.Count) products so far..." -ForegroundColor Gray
    }
} while ($products.Count -eq $limit)

Write-Host "Total products found: $($allProducts.Count)" -ForegroundColor Green

Write-Host "`n=== Processing products ===" -ForegroundColor Cyan
$published = 0
$attached = 0

foreach($p in $allProducts) {
    # Publish if draft
    if($p.status -ne "published") {
        try {
            $body = @{status="published"} | ConvertTo-Json
            Invoke-RestMethod "$base/admin/products/$($p.id)" -Headers $hAdm -Method Post -Body $body -ContentType "application/json" | Out-Null
            Write-Host "  Published: $($p.title)" -ForegroundColor Green
            $published++
        } catch {
            Write-Host "  Failed to publish: $($p.title)" -ForegroundColor Red
        }
    }
    
    # Attach to sales channel
    try {
        $body = @{ add=@($sc.id) } | ConvertTo-Json
        Invoke-RestMethod "$base/admin/products/$($p.id)/sales-channels/batch" -Headers $hAdm -Method Post -Body $body -ContentType "application/json" | Out-Null
        $attached++
    } catch {
        try {
            $body = @{ add=@($p.id) } | ConvertTo-Json
            Invoke-RestMethod "$base/admin/sales-channels/$($sc.id)/products/batch" -Headers $hAdm -Method Post -Body $body -ContentType "application/json" | Out-Null
            $attached++
        } catch {
            # Silent fail - might already be attached
        }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Products published: $published" -ForegroundColor Green
Write-Host "Products attached to channel: $attached" -ForegroundColor Green
Write-Host ""

