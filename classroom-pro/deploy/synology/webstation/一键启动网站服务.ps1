# 看班智控台 Pro - Win11 本机一键启服（PowerShell）
# 与「一键启动网站服务.bat」同目录，双击 bat 即可；本脚本供高级排查。
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "========================================"
Write-Host "  看班智控台 Pro - 本机网站服务"
Write-Host "========================================"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未安装 Node.js。请到 https://nodejs.org/ 安装 LTS 后重试。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

if (-not (Test-Path "server\package.json") -or -not (Test-Path "client\dist\index.html")) {
  Write-Host "[错误] 部署包不完整（需要 server 与 client\dist）。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

Push-Location server
npm install --omit=dev
Pop-Location

$env:PORT = "3789"
Start-Process "http://127.0.0.1:3789/"
Write-Host "服务启动中… 关闭窗口即停止。" -ForegroundColor Green
node server\index.js
