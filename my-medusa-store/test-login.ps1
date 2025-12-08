# Test login
$body = @{
    email = "admin@medusa-test.com"
    password = "supersecret"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri 'http://localhost:9000/admin/auth/user/emailpass' -Method Post -Body $body -ContentType 'application/json' -SessionVariable session

Write-Host "Login response:"
$response | ConvertTo-Json -Depth 10

# Extract cookie
Write-Host "`nCookie:"
$session.Cookies.GetCookies('http://localhost:9000') | Format-Table

# Test API with session
Write-Host "`nTesting API with session:"
$productResponse = Invoke-RestMethod -Uri 'http://localhost:9000/admin/products?limit=1' -WebSession $session
Write-Host "Products fetched: $($productResponse.products.Count)"
