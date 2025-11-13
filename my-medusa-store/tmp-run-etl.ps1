$BASE = "http://localhost:7070"
$discover = Invoke-RestMethod -Method Get -Uri "$BASE/discover"
$map = $discover.jobId
Write-Host "discover jobId: $map"
do {
  Start-Sleep 2
  $s = Invoke-RestMethod "$BASE/job/$map/status"
  $processed = if ($s.progress -and $s.progress.processed) { $s.progress.processed } else { 0 }
  Write-Host ("discover: {0} processed={1}" -f $s.status, $processed)
} while ($s.status -in @('queued','running'))
if ($s.status -ne 'completed') {
  $errorMessage = if ($s.error) { $s.error } elseif ($s.errors) { $s.errors | ConvertTo-Json -Depth 5 } else { 'Unknown discover error' }
  throw ("Discover failed: " + $errorMessage)
}
$migrate = Invoke-RestMethod -Method Post -Uri "$BASE/migrate" -ContentType 'application/json' -Body (@{
    dryRun = $false
    mappingJobId = $map
    resumeFromCheckpoint = $true
  } | ConvertTo-Json)
$mid = $migrate.jobId
Write-Host "migrate jobId: $mid"
do {
  Start-Sleep 2
  $ms = Invoke-RestMethod "$BASE/job/$mid/status"
  $p = $ms.progress
  $processed = if ($p -and $p.processed) { $p.processed } else { 0 }
  $succeeded = if ($p -and $p.succeeded) { $p.succeeded } else { 0 }
  $failed = if ($p -and $p.failed) { $p.failed } else { 0 }
  Write-Host ("migrate: {0} processed={1} ok={2} err={3}" -f $ms.status, $processed, $succeeded, $failed)
} while ($ms.status -in @('queued','running'))
$ms | ConvertTo-Json -Depth 6
