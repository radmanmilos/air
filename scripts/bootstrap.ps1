# Bootstrap installer for AIR on Windows (run as Administrator).
param()
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
try {
  New-ItemProperty -Path $regPath -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null
  Write-Host "Enabled Windows long paths."
} catch {
  Write-Host "Could not set registry (run as Administrator): $_"
}
git config --system core.longpaths true
npm install -g github:radmanmilos/air
