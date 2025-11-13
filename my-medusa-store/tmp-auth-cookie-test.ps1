$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$cookie = New-Object System.Net.Cookie
$cookie.Name = 'connect.sid'
$cookie.Value = 's%3Ac9U0c9FR99EfaIXrDsNGpzAfwGMjDDOS.evnUxB8RGHUXj8s%2BH23t1hDOAeHGfh4AoDCkrX2Wm88'
$cookie.Domain = 'localhost'
$cookie.Path = '/'
$cookie.HttpOnly = $true
$cookie.Secure = $false

$session.Cookies.Add($cookie)

$response = Invoke-WebRequest -Uri 'http://localhost:9000/admin/products?limit=1' -WebSession $session -MaximumRedirection 0 -ErrorAction SilentlyContinue
$response.StatusCode
$response.RawContent
$response | ConvertTo-Json -Depth 4

