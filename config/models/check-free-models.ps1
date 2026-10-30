# Check OpenRouter free models availability
param(
    [string]$Tool = "all"
)

$envPath = ".\.env"
if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
        if ($line -match '^\s*([^#][^=]+)\s*=\s*(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

Write-Host "=== OpenRouter Free Models Availability Check ===" -ForegroundColor Cyan
Write-Host "Checking at $(Get-Date)" -ForegroundColor Gray

try {
    $headers = @{
        "Authorization" = "Bearer $env:OPENAI_API_KEY"
        "HTTP-Referer" = "https://github.com/radmanmilos/Games-for-kids"
        "X-Title" = "Games for kids"
    }
    $response = Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/models" -Headers $headers -Method Get
    $freeModels = $response.data | Where-Object { $_.id -like "*:free" }
    
    Write-Host "
Currently available free models:" -ForegroundColor Green
    $freeModels | ForEach-Object { Write-Host "  - $($_.id)" -ForegroundColor White }
    
    Write-Host "
Checking saved models..." -ForegroundColor Cyan
    $saved = Get-Content "tools\aider-free-models.yml" | Where-Object { $_.trim() -match "^\s*-\s+(.+)" }
    foreach ($line in $saved) {
        if ($line -match "^\s*-\s+(.+)") {
            $model = $matches[1].Trim()
            if ($freeModels.id -contains $model) {
                Write-Host "  ✓ $model - AVAILABLE" -ForegroundColor Green
            } else {
                Write-Host "  ✗ $model - UNAVAILABLE (remove or replace)" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "Error checking models: $($_.Exception.Message)" -ForegroundColor Red
}
