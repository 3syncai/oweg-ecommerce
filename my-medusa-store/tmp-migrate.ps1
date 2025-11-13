$base = "http://localhost:7070"

param(
    [string]$MappingJobId,
    [int]$MaxProducts = 2
)

$base = "http://localhost:7070"

if (-not $MappingJobId) {
    Write-Error "MappingJobId parameter is required."
    exit 1
}

$body = @{
    dryRun               = $false
    mappingJobId         = $MappingJobId
    resumeFromCheckpoint = $false
    maxProducts          = $MaxProducts
} | ConvertTo-Json

$migrate = Invoke-RestMethod -Method Post -Uri "$base/migrate" `
    -ContentType 'application/json' `
    -Body $body

$jobId = $migrate.jobId
Write-Host "migrate jobId: $jobId"

do {
    Start-Sleep -Seconds 2
    $status = Invoke-RestMethod -Uri "$base/jobs/$jobId"
    $progress = $status.progress
    $processed = if ($progress -and $progress.processed) { $progress.processed } else { 0 }
    $succeeded = if ($progress -and $progress.succeeded) { $progress.succeeded } else { 0 }
    $failed = if ($progress -and $progress.failed) { $progress.failed } else { 0 }
    Write-Host (
        "migrate: {0} processed={1} ok={2} err={3}" -f `
            $status.status, `
            $processed, `
            $succeeded, `
            $failed
    )
} while ($status.status -in 'queued','running')

if ($status.status -ne 'succeeded') {
    throw ("Migration failed: {0}" -f ($status.errors | ConvertTo-Json -Depth 5))
}

return $jobId
param(
    [Parameter(Mandatory = $true)]
    [string] $MappingJobId
)

$BASE = 'http://localhost:7070'

$migrate = Invoke-RestMethod -Method Post -Uri "$BASE/migrate" `
    -ContentType 'application/json' `
    -Body (@{
        dryRun = $false
        mappingJobId = $MappingJobId
        resumeFromCheckpoint = $true
    } | ConvertTo-Json)

$mid = $migrate.jobId
Write-Host ("migrate jobId: {0}" -f $mid)

do {
    Start-Sleep -Seconds 2
    $ms = Invoke-RestMethod "$BASE/jobs/$mid"
    $progress = $ms.progress
    Write-Host ("migrate: {0} processed={1} ok={2} err={3}" -f $ms.status, $progress.processed, $progress.succeeded, $progress.failed)
} while ($ms.status -in @('queued', 'running'))

$ms | ConvertTo-Json -Depth 6

