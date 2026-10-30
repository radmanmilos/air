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

# Resolve the models file relative to this script's location (config/models/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$modelsFile = Join-Path $ScriptDir "aider-free-models.yml"

if (-not (Test-Path $modelsFile)) {
    Write-Host "Models file not found: $modelsFile" -ForegroundColor Red
    exit 1
}

try {
    $headers = @{
        "Authorization" = "Bearer $env:OPENROUTER_API_KEY"
        "HTTP-Referer" = "https://github.com/radmanmilos/air"
        "X-Title" = "air"
    }
    $response = Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/models" -Headers $headers -Method Get
    $freeModels = $response.data | Where-Object { $_.id -like "*:free" }

    Write-Host "`nCurrently available free models:" -ForegroundColor Green
    $freeModels | ForEach-Object { Write-Host "  - $($_.id)" -ForegroundColor White }

    Write-Host "`nChecking saved models..." -ForegroundColor Cyan

    # Parse YAML deliberately: lines are either `key: value` or `  - model`
    $defaultModel = $null
    $backupModels = [System.Collections.Generic.List[string]]::new()
    Get-Content $modelsFile | ForEach-Object {
        $line = $_
        if ($line -match '^\s*default:\s*(.+)$') {
            $defaultModel = $matches[1].Trim()
        } elseif ($line -match '^\s*-\s+(.+)$') {
            $backupModels.Add($matches[1].Trim())
        }
    }

    if ($defaultModel) {
        if ($freeModels.id -contains $defaultModel) {
            Write-Host "  [default]  $defaultModel - AVAILABLE" -ForegroundColor Green
        } else {
            Write-Host "  [default]  $defaultModel - UNAVAILABLE (remove or replace)" -ForegroundColor Red
        }
    }

    foreach ($model in $backupModels) {
        if ($freeModels.id -contains $model) {
            Write-Host "  [backup]   $model - AVAILABLE" -ForegroundColor Green
        } else {
            Write-Host "  [backup]   $model - UNAVAILABLE (remove or replace)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "Error checking models: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}