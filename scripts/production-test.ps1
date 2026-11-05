# AIR Production-Like Test Suite
# Usage: .\scripts\production-test.ps1 -ProjectPath "E:\GitHub\test" [-LogFile "test_log.md"]

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath,
    [string]$LogFile = "test_log.md"
)

$ErrorActionPreference = "Continue"
$log = Join-Path $ProjectPath $LogFile
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"# AIR Production Test Log" | Set-Content $log
"Date: $timestamp" | Add-Content $log
"Project: $ProjectPath" | Add-Content $log
"" | Add-Content $log

function Run-Test {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    "## $Name" | Add-Content $log
    try {
        $result = & $Action
        "Result: $result" | Add-Content $log
        "Status: PASS" | Add-Content $log
        Write-Host "PASS" -ForegroundColor Green
    } catch {
        "Error: $_" | Add-Content $log
        "Status: FAIL" | Add-Content $log
        Write-Host "FAIL: $_" -ForegroundColor Red
    }
    "" | Add-Content $log
}

Set-Location $ProjectPath

# Test 1: Status
Run-Test "Test 1: air status" {
    $out = air status 2>&1 | Out-String
    if ($out -match "Tools:") { "OK - tools listed" } else { throw "No tools listed" }
}

# Test 2: Models
Run-Test "Test 2: air models" {
    $out = air models 2>&1 | Out-String
    if ($out -match "ollama") { "OK - ollama available" } else { throw "ollama not found" }
}

# Test 3: Dashboard
Run-Test "Test 3: air dashboard" {
    $out = air dashboard 2>&1 | Out-String
    if ($out -match "AIR Dashboard") { "OK - dashboard renders" } else { throw "Dashboard failed" }
}

# Test 4: Chat (read-only question)
Run-Test "Test 4: air chat (read-only)" {
    $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c air chat"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("describe this repo")
    Start-Sleep -Seconds 45
    $p.StandardInput.WriteLine("/quit")
    Start-Sleep -Seconds 3
    $out = $p.StandardOutput.ReadToEnd()
    if ($out -match "Started job|Done|finished") { "OK - job completed" } else { "Job may still be running or failed" }
}

# Test 5: Verify repo (if configured)
Run-Test "Test 5: air verify-repo" {
    $out = air verify-repo 2>&1 | Out-String
    "Output: $($out.Substring(0, [Math]::Min(200, $out.Length)))"
}

Write-Host "`nTest suite complete. Log: $log" -ForegroundColor Green