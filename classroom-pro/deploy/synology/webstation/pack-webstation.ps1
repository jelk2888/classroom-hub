# Pack folder for Synology Web Station (Node.js containerized site)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Out = Join-Path $PSScriptRoot "..\..\webstation-upload\classroom-pro"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Path $Out | Out-Null

Push-Location (Join-Path $Root "client")
if (-not (Test-Path "node_modules")) { npm install }
npm run build
if (-not (Test-Path "dist\index.html")) { throw "client build failed" }
Pop-Location

Copy-Item (Join-Path $PSScriptRoot "package.json") (Join-Path $Out "package.json") -Force
New-Item -ItemType Directory -Path (Join-Path $Out "scripts") -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot "scripts\ensure-dirs.js") (Join-Path $Out "scripts\ensure-dirs.js") -Force

robocopy (Join-Path $Root "server") (Join-Path $Out "server") /E /NFL /NDL /NJH /NJS /nc /ns /np /XD node_modules data /XF *.db | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy server failed" }

New-Item -ItemType Directory -Path (Join-Path $Out "client\dist") -Force | Out-Null
robocopy (Join-Path $Root "client\dist") (Join-Path $Out "client\dist") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy dist failed" }

Copy-Item (Join-Path $PSScriptRoot "WebStation-guide.md") (Join-Path $Out "README-WebStation.md") -Force

# Installer (if packed)
$dlSrc = Join-Path $Root "server\downloads"
$dlOut = Join-Path $Out "server\downloads"
New-Item -ItemType Directory -Path $dlOut -Force | Out-Null
if (Test-Path $dlSrc) {
  robocopy $dlSrc $dlOut /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy downloads failed" }
}
Get-ChildItem -LiteralPath (Join-Path $Root "board-desktop\dist-exe") -Filter "*-*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*安装程序*" -or $_.Name -like "*Setup*" -or $_.Name -like "*installer*" } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dlOut $_.Name) -Force }
# Fallback explicit copy via Python-safe path
$installerHint = Join-Path $Root "board-desktop\dist-exe"
if (Test-Path -LiteralPath $installerHint) {
  Get-ChildItem -LiteralPath $installerHint -File -Filter "*.exe" | ForEach-Object {
    if ($_.Length -gt 10MB) {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dlOut $_.Name) -Force
    }
  }
}

# Usage doc + Win11 launchers
Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {
  $_.Name -eq "源码使用说明.txt" -or $_.Name -like "一键启动网站服务.*"
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Out $_.Name) -Force
}

Write-Host "OK: $Out"
Write-Host "Upload to Synology e.g. /volume1/web/classroom-pro/"
(Get-ChildItem $Out -Recurse -File).Count
