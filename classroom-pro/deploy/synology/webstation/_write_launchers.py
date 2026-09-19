# -*- coding: utf-8 -*-
"""写出 Windows 可双击的启动脚本：bat 用 GBK+CRLF，ps1 用 UTF-8 BOM+CRLF。"""
from pathlib import Path

BAT = """@echo off
cd /d "%~dp0"
title 看班智控台 Pro

echo ========================================
echo   看班智控台 Pro - 一键启动本机网站
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js 18 或更高版本：
  echo   https://nodejs.org/
  echo 安装完成后重新双击本程序。
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo 已检测到 Node %%v
echo.

if not exist "server\\package.json" (
  echo [错误] 未找到 server 目录。请把本文件放在部署包根目录。
  pause
  exit /b 1
)

if not exist "client\\dist\\index.html" (
  echo [错误] 未找到 client\\dist。请使用完整部署包。
  pause
  exit /b 1
)

echo 正在检查依赖...
pushd server
if exist "node_modules\\express\\package.json" (
  echo 依赖已在本文件夹内。
) else (
  echo 首次运行，正在下载依赖，需要联网...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [错误] npm install 失败，请检查网络后重试。
    popd
    pause
    exit /b 1
  )
)
popd

echo.
echo 正在启动网站服务...
echo 浏览器将自动打开。关闭本窗口即停止服务。
echo.

set PORT=3789
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789/"

node server\\index.js
echo.
echo 服务已停止。
pause
"""

PS1 = """# 看班智控台 Pro - 本机一键启动
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

if (-not (Test-Path -LiteralPath "server\\package.json") -or -not (Test-Path -LiteralPath "client\\dist\\index.html")) {
  Write-Host "[错误] 部署包不完整，需要 server 与 client\\dist。" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}

if (Test-Path -LiteralPath "server\\node_modules\\express\\package.json") {
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
node server\\index.js
"""

HERE = Path(__file__).resolve().parent
UPLOAD = HERE.parent.parent / "webstation-upload" / "classroom-pro"
bat = BAT.replace("\n", "\r\n").encode("gbk")
ps1 = PS1.replace("\n", "\r\n").encode("utf-8-sig")
for folder in (HERE, UPLOAD):
    (folder / "一键启动网站服务.bat").write_bytes(bat)
    (folder / "一键启动网站服务.ps1").write_bytes(ps1)
    print("wrote", folder)
