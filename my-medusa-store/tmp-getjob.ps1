param(
    [Parameter(Mandatory = $true)]
    [string] $JobId
)

$BASE = 'http://localhost:7070'
$job = Invoke-RestMethod "$BASE/jobs/$JobId"
$job | ConvertTo-Json -Depth 6


