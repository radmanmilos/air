<#
AIR bootstrap installer (Windows).

If install fails with TAR_ENTRY_ERROR / ENOENT on deep paths, enable long paths first
by running this in an elevated PowerShell, then re-run the installer:

  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
  git config --system core.longpaths true
$ErrorActionPreference = "Continue"
# Try the convenient GitHub shortcut first.
npm install -g github:radmanmilos/air
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub shortcut failed. Cleaning up and falling back to tarball install..."
  npm uninstall -g air
  npm install -g "https://github.com/radmanmilos/air/archive/refs/heads/main.tar.gz"
}
#>
param()
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
try {
  New-ItemProperty -Path $regPath -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null
  Write-Host "Enabled Windows long paths."
} catch {
  Write-Host "Could not set registry (run as Administrator)."
  Write-Host 'Run: Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1'
}
try { git config --system core.longpaths true } catch {}
npm install -g github:radmanmilos/air
