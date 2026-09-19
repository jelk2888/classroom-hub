# 看班智控台 Pro - 本机一键启动
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "========================================"
Write-Host "  看班智控台 Pro - 本机网站服务"
Write-Host "========================================"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未安装 Node.js。请到 https://nodejs.org/ 安装后重试。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

if (-not (Test-Path -LiteralPath "server\package.json") -or -not (Test-Path -LiteralPath "client\dist\index.html")) {
  Write-Host "[错误] 部署包不完整，需要 server 与 client\dist。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

if (Test-Path -LiteralPath "server\node_modules\express\package.json") {
  Write-Host "依赖已在本文件夹内。"
} else {
  Write-Host "首次运行，正在下载依赖..."
  Push-Location -LiteralPath "server"
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "[错误] npm install 失败，请检查网络后重试。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
  }
  Pop-Location
}

$env:PORT = "3789"
Start-Process "http://127.0.0.1:3789/"
Write-Host "服务启动中。关闭窗口即停止。" -ForegroundColor Green
node server\index.js
