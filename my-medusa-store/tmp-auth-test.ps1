$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Invoke-RestMethod -Method Post -Uri 'http://localhost:9000/admin/auth' `
    -ContentType 'application/json' `
    -Body (@{
        email = 'admin@example.com'
        password = 'SuperSecret123!'
    } | ConvertTo-Json) `
    -WebSession $session | Out-Null

$response = Invoke-RestMethod -Uri 'http://localhost:9000/admin/products?limit=1' `
    -WebSession $session

$response | ConvertTo-Json -Depth 4


