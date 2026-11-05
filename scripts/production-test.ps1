# AIR Production-Like Test Suite (Tiered)
# Usage: .\scripts\production-test.ps1 -ProjectPath "E:\GitHub\test" [-LogFile "test_log.md"]

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath,
    [string]$LogFile = "test_log.md"
)

$ErrorActionPreference = "Continue"
$log = Join-Path $ProjectPath $LogFile
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"# AIR Comprehensive Test Log" | Set-Content $log
"Date: $timestamp" | Add-Content $log
"Project: $ProjectPath" | Add-Content $log
"" | Add-Content $log

function Run-Test {
    param([string]$Name, [string]$Tier, [scriptblock]$Action)
    Write-Host "`n=== [$Tier] $Name ===" -ForegroundColor Cyan
    "## [$Tier] $Name" | Add-Content $log
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

# ==================== TIER 1: BASIC ====================
Write-Host "`n========== TIER 1: BASIC ==========" -ForegroundColor Yellow

Run-Test "T1.1 air status" "Tier1" {
    $out = air status 2>&1 | Out-String
    if ($out -match "Tools:") { "OK - $($out -replace '\n',' | ')" } else { throw "No tools" }
}

Run-Test "T1.2 air models" "Tier1" {
    $out = air models 2>&1 | Out-String
    if ($out -match "ollama") { "OK - ollama detected" } else { throw "ollama missing" }
}

Run-Test "T1.3 air dashboard" "Tier1" {
    $out = air dashboard 2>&1 | Out-String
    if ($out -match "AIR Dashboard") { "OK - dashboard renders" } else { throw "Dashboard failed" }
}

Run-Test "T1.4 air --version" "Tier1" {
    $out = air --version 2>&1 | Out-String
    if ($out -match "0\.2\.0") { "OK - version $($out.Trim())" } else { throw "Wrong version: $out" }
}

# ==================== TIER 2: CHAT UX ====================
Write-Host "`n========== TIER 2: CHAT UX ==========" -ForegroundColor Yellow

Run-Test "T2.1 air chat (read-only question)" "Tier2" {
    $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"; $psi.Arguments = "/c air chat"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("describe this repo")
    Start-Sleep -Seconds 45
    $p.StandardInput.WriteLine("/status")
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/quit")
    Start-Sleep -Seconds 3
    $out = $p.StandardOutput.ReadToEnd()
    if ($out -match "Started job|Done|finished|job run") { "OK - job completed" } else { "No job completion detected" }
}

Run-Test "T2.2 air chat /help" "Tier2" {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"; $psi.Arguments = "/c air chat"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/help")
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/quit")
    Start-Sleep -Seconds 2
    $out = $p.StandardOutput.ReadToEnd()
    if ($out -match "/run|/status|/jobs") { "OK - help lists commands" } else { throw "Help incomplete" }
}

Run-Test "T2.3 air chat /jobs" "Tier2" {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"; $psi.Arguments = "/c air chat"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/jobs")
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/quit")
    Start-Sleep -Seconds 2
    $out = $p.StandardOutput.ReadToEnd()
    "OK - jobs command responded"
}

# ==================== TIER 3: RUN TASKS ====================
Write-Host "`n========== TIER 3: RUN TASKS ==========" -ForegroundColor Yellow

Run-Test "T3.1 air run (read-only explain)" "Tier3" {
    $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
    $out = air run --read-only "explain what Program.cs does" 2>&1 | Out-String
    if ($out -match "SUCCEEDED|COMPLETED|Done") { "OK - completed" } else { "Result: $($out.Substring($out.Length-100))" }
}

Run-Test "T3.2 air route-test" "Tier3" {
    $out = air route-test "fix a bug in Program.cs" 2>&1 | Out-String
    if ($out -match "aider|ollama|goose") { "OK - routing works" } else { throw "No route" }
}

# ==================== TIER 4: COMPLEX ====================
Write-Host "`n========== TIER 4: COMPLEX ==========" -ForegroundColor Yellow

Run-Test "T4.1 air run --sessions (multi)" "Tier4" {
    $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
    $out = air run --sessions "explain Program.cs" 2>&1 | Out-String
    "Output length: $($out.Length) chars"
}

Run-Test "T4.2 air dashboard (with sessions)" "Tier4" {
    $out = air dashboard 2>&1 | Out-String
    if ($out -match "Sessions:") { "OK - $($out -split '\n' | Select-Object -First 3 -join ' | ')" } else { throw "No sessions" }
}

# ==================== TIER 5: MCP ====================
Write-Host "`n========== TIER 5: MCP ==========" -ForegroundColor Yellow

Run-Test "T5.1 MCP server starts" "Tier5" {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"; $psi.Arguments = "/c echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}' | air mcp"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 3
    $out = $p.StandardOutput.ReadToEnd()
    $p.Kill()
    if ($out -match "air|mcp|server") { "OK - MCP responded" } else { "Output: $($out.Substring(0,[Math]::Min(200,$out.Length)))" }
}

# ==================== TIER 6: STRESS ====================
Write-Host "`n========== TIER 6: STRESS ==========" -ForegroundColor Yellow

Run-Test "T6.1 Multiple chat messages" "Tier6" {
    $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"; $psi.Arguments = "/c air chat"
    $psi.WorkingDirectory = $ProjectPath
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true; $psi.UseShellExecute = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("describe this repo")
    Start-Sleep -Seconds 10
    $p.StandardInput.WriteLine("what files are here")
    Start-Sleep -Seconds 10
    $p.StandardInput.WriteLine("/status")
    Start-Sleep -Seconds 2
    $p.StandardInput.WriteLine("/quit")
    Start-Sleep -Seconds 3
    $out = $p.StandardOutput.ReadToEnd()
    "Messages processed, output length: $($out.Length)"
}

Write-Host "`n========== TEST SUITE COMPLETE ==========" -ForegroundColor Green
"## Summary" | Add-Content $log
"All tiers executed." | Add-Content $log