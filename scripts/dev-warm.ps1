# Keep Medusa (:9000) and Next (:3000) warm.
# Skips start when the port is already listening so you don't cold-restart all day.
# Code edits still hot-reload while these processes stay up.

$ErrorActionPreference = "Continue"

function Test-PortListening([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

$StorefrontRoot = Split-Path -Parent $PSScriptRoot
$MedusaRoot = Join-Path $StorefrontRoot "my-medusa-store"

Write-Host ""
Write-Host "=== OWEG keep-warm ==="
Write-Host "Storefront: $StorefrontRoot"
Write-Host "Medusa:     $MedusaRoot"
Write-Host ""

if (-not (Test-Path (Join-Path $MedusaRoot "package.json"))) {
  Write-Error "Medusa package.json not found at $MedusaRoot"
  exit 1
}
if (-not (Test-Path (Join-Path $StorefrontRoot "package.json"))) {
  Write-Error "Storefront package.json not found at $StorefrontRoot"
  exit 1
}

# --- Medusa :9000 ---
if (Test-PortListening 9000) {
  Write-Host "[Medusa] already warm on :9000 - skip start"
} else {
  Write-Host "[Medusa] starting... (new window, leave it open)"
  $medusaCmd = @"
Set-Location -LiteralPath '$MedusaRoot'
Write-Host 'Medusa keep-warm - leave this window open while developing'
npm run dev
"@
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $MedusaRoot -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    $medusaCmd
  )
}

# --- Next :3000 ---
if (Test-PortListening 3000) {
  Write-Host "[Next]   already warm on :3000 - skip start"
} else {
  Write-Host "[Next]   starting... (new window, leave it open)"
  $nextCmd = @"
Set-Location -LiteralPath '$StorefrontRoot'
Write-Host 'Next keep-warm - leave this window open while developing'
npm run dev
"@
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $StorefrontRoot -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    $nextCmd
  )
}

Write-Host ""
Write-Host "Tip: edit + save; HMR / medusa develop pick up changes."
Write-Host "Restart only for .env/config or a stuck process."
Write-Host "Leave Postgres (Docker / service) running the same way."
Write-Host ""
