@echo off
cd /d "%~dp0"
title �����ǿ�̨ Pro

echo ========================================
echo   �����ǿ�̨ Pro - һ������������վ
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [����] δ��⵽ Node.js��
  echo ���Ȱ�װ Node.js 18 ����߰汾��
  echo   https://nodejs.org/
  echo ��װ��ɺ�����˫��������
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo �Ѽ�⵽ Node %%v
echo.

if not exist "server\package.json" (
  echo [����] δ�ҵ� server Ŀ¼����ѱ��ļ����ڲ������Ŀ¼��
  pause
  exit /b 1
)

if not exist "client\dist\index.html" (
  echo [����] δ�ҵ� client\dist����ʹ�������������
  pause
  exit /b 1
)

echo ���ڼ������...
pushd server
if exist "node_modules\express\package.json" (
  echo �������ڱ��ļ����ڡ�
) else (
  echo �״����У�����������������Ҫ����...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [����] npm install ʧ�ܣ�������������ԡ�
    popd
    pause
    exit /b 1
  )
)
popd

echo.
echo ����������վ����...
echo ��������Զ��򿪡��رձ����ڼ�ֹͣ����
echo.

set PORT=3789
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789/"

node server\index.js
echo.
echo ������ֹͣ��
pause
