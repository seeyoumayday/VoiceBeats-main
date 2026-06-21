@echo off
setlocal enabledelayedexpansion

:: このスクリプトのあるディレクトリを取得
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
set "SOURCE_DIR=%PROJECT_DIR%\source"

:: sourceディレクトリに移動
cd /d "%SOURCE_DIR%"

set PORT=8000
set URL=http://localhost:%PORT%

echo =============================================
echo  Voice Beats を起動しています...
echo  ブラウザで %URL% を自動的に開きます。
echo =============================================

:: ブラウザを開く
start %URL%

:: サーバーの起動
where python3 >nul 2>nul
if %ERRORLEVEL% equ 0 (
  echo [INFO] Python 3 を検出しました。カスタムサーバー(bin/server.py)を起動します。
  python3 "%SCRIPT_DIR%server.py"
  goto :end
)

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
  echo [INFO] Node.js を検出しました。カスタムサーバー(bin/server.js)を起動します。
  node "%SCRIPT_DIR%server.js"
  goto :end
)

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
  echo [INFO] Python を検出しました。
  python "%SCRIPT_DIR%server.py" 2>nul
  if %ERRORLEVEL% neq 0 (
    echo [WARNING] SharedArrayBufferヘッダーをサポートするためにPython 3またはNode.jsを推奨します。通常のサーバーとして起動します。
    python -m SimpleHTTPServer %PORT%
  )
  goto :end
)

echo [ERROR] Python または Node.js が見つかりませんでした。
echo Voice Beats はセキュリティ上の理由（SharedArrayBufferの利用）から、ローカルサーバー経由で起動する必要があります。
echo Python または Node.js をインストールしてから再度実行してください。
pause
exit /b 1

:end
pause
