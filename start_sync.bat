@echo off
title SobhaInfra ERP - Tally Live Sync Service
color 0A
cd /d "%~dp0"

echo ===================================================
echo   SobhaInfra ERP - TallyPrime Cloud Sync Service
echo ===================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not installed or not in PATH!
    echo Please download and install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b
)

:: Install dependencies if missing
echo [*] Checking and installing required Python packages...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    pip install requests
)

echo.
echo [*] Starting Tally Sync Service...
echo [*] Connecting to Tally on port 9000...
echo [*] Live Cloud Target: https://sobhainfra-erp.netlify.app
echo.

:: Run sync script
python tally-sync.py

pause
