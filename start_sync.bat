@echo off
title SobhaInfra ERP - Tally Live Sync Service
color 0A
cd /d "%~dp0"

echo ===================================================
echo   SobhaInfra ERP - TallyPrime Cloud Sync Service
echo ===================================================
echo.

:: Locate Python Executable
set "PY_CMD=python"
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%D\python.exe" set "PY_CMD=%%D\python.exe"
)
if "%PY_CMD%"=="python" (
    for /d %%D in ("C:\Program Files\Python*") do (
        if exist "%%D\python.exe" set "PY_CMD=%%D\python.exe"
    )
)
if "%PY_CMD%"=="python" (
    for /f "delims=" %%I in ('where py 2^>nul') do (
        echo "%%I" | findstr /i "WindowsApps" >nul
        if errorlevel 1 set "PY_CMD=py"
    )
)

:: Check if Python is runnable
"%PY_CMD%" --version >nul 2>&1
if %errorlevel% neq 0 (
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Python is not installed or not in PATH!
        echo Please download and install Python from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    ) else (
        set "PY_CMD=python"
    )
)

:: Install dependencies if missing
echo [*] Checking and installing required Python packages (requests)...
"%PY_CMD%" -m pip install requests --quiet >nul 2>&1
if %errorlevel% neq 0 (
    "%PY_CMD%" -m pip install requests
)

echo.
echo [*] Starting Tally Sync Service...
echo [*] Connecting to Tally on port 9000...
echo [*] Live Cloud Target: https://sobhainfra-erp.netlify.app
echo.

:: Run sync script
"%PY_CMD%" tally-sync.py

pause
