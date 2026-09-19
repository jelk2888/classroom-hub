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
# 网页静态资源；安装包只放在 server\downloads，不进 client\dist，避免重复约 130MB
robocopy (Join-Path $Root "client\dist") (Join-Path $Out "client\dist") /E /NFL /NDL /NJH /NJS /nc /ns /np /XD downloads | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy dist failed" }
$dupDl = Join-Path $Out "client\dist\downloads"
if (Test-Path $dupDl) { Remove-Item $dupDl -Recurse -Force }

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

# 说明与 Windows 启动脚本（整份复制，避免中文文件名匹配失败）
Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {
  $_.Extension -in ".txt", ".bat", ".ps1" -and $_.Name -notlike "pack-*"
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Out $_.Name) -Force
}

# 生产依赖打进文件夹，复制走后可离线直接启动
$srvOut = Join-Path $Out "server"
if (-not (Test-Path (Join-Path $srvOut "node_modules\express\package.json"))) {
  Push-Location $srvOut
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install in upload pack failed" }
  Pop-Location
}

Write-Host "OK: $Out"
Write-Host "Upload to Synology e.g. /volume1/web/classroom-pro/"
(Get-ChildItem $Out -Recurse -File).Count
