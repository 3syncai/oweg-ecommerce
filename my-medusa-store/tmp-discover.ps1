$base = "http://localhost:7070"

$discover = Invoke-RestMethod -Method Post -Uri "$base/discover" `
    -ContentType 'application/json' `
    -Body (@{ dryRun = $true } | ConvertTo-Json)

$map = $discover.jobId
Write-Host "discover jobId: $map"

do {
    Start-Sleep -Seconds 2
    $status = Invoke-RestMethod -Uri "$base/jobs/$map"
    Write-Host ("discover: {0} processed={1}" -f $status.status, $status.progress.processed)
} while ($status.status -in 'queued','running')

if ($status.status -ne 'succeeded') {
    throw ("Discover failed: {0}" -f ($status.errors | ConvertTo-Json -Depth 5))
}

return $map
$BASE = 'http://localhost:7070'

$discover = Invoke-RestMethod -Method Post -Uri "$BASE/discover" `
    -ContentType 'application/json' `
    -Body (@{ dryRun = $true } | ConvertTo-Json)

$map = $discover.jobId
Write-Host ("discover jobId: {0}" -f $map)

do {
    Start-Sleep -Seconds 2
    $s = Invoke-RestMethod "$BASE/jobs/$map"
    $processed = $s.progress.processed
    Write-Host ("discover: {0} processed={1}" -f $s.status, $processed)
} while ($s.status -in @('queued', 'running'))

if ($s.status -notin @('succeeded', 'completed')) {
    throw ("Discover failed: {0}" -f ($s.errors | ConvertTo-Json -Depth 4))
}

Write-Host "Discover completed successfully."

