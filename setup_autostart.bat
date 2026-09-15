@echo off
setlocal enabledelayedexpansion
title SobhaInfra ERP - Client PC Auto-Start Setup
color 0A

echo ============================================================
echo   SOBHAINFRA ERP - TALLY AUTO-START SETUP (ONE-TIME)
echo ============================================================
echo.

:: 1. Check Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] This installer must be run as Administrator!
    echo.
    echo Please right-click 'setup_autostart.bat' and select:
    echo    "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: 2. Determine Current Folder and Permanent Installation Directory
set "SOURCE_DIR=%~dp0"
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
set "INSTALL_DIR=C:\Users\Public\SobhaInfra_Sync"
set "TASK_NAME=SobhaInfra_Tally_Sync"

echo [*] Source directory:      %SOURCE_DIR%
echo [*] Installation target:   %INSTALL_DIR%
echo.

:: 3. Verify tally-sync.py exists in source
if not exist "%SOURCE_DIR%\tally-sync.py" (
    color 0C
    echo [ERROR] 'tally-sync.py' was not found in:
    echo %SOURCE_DIR%
    echo Please make sure setup_autostart.bat and tally-sync.py are in the same folder.
    echo.
    pause
    exit /b 1
)

:: 4. Locate Python Executable
set "PY_EXE="
for /f "delims=" %%I in ('where python 2^>nul') do (
    if not defined PY_EXE set "PY_EXE=%%I"
)
if not defined PY_EXE (
    for /f "delims=" %%I in ('where py 2^>nul') do (
        if not defined PY_EXE set "PY_EXE=%%I"
    )
)
:: Common Windows installation fallback paths
if not defined PY_EXE (
    for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    for /d %%D in ("C:\Program Files\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    color 0C
    echo [ERROR] Python was not found on this computer!
    echo.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo CRITICAL: During installation, check the box:
    echo    [x] "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

echo [*] Python found: %PY_EXE%

:: 5. Install required Python packages
echo [*] Installing/Verifying Python dependencies (requests)...
"%PY_EXE%" -m pip install requests --quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Retrying pip install requests...
    "%PY_EXE%" -m pip install requests
)

:: 6. Create permanent installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy files
echo [*] Copying sync files to permanent directory...
copy /y "%SOURCE_DIR%\tally-sync.py" "%INSTALL_DIR%\" >nul
if exist "%SOURCE_DIR%\.env" copy /y "%SOURCE_DIR%\.env" "%INSTALL_DIR%\" >nul
if exist "%SOURCE_DIR%\requirements.txt" copy /y "%SOURCE_DIR%\requirements.txt" "%INSTALL_DIR%\" >nul

:: 7. Create silent VBS launcher
echo [*] Creating silent background runner...
(
echo Set oShell = CreateObject^("WScript.Shell"^)
echo oShell.Run "cmd /c cd /d ""%INSTALL_DIR%"" ^&^& ""%PY_EXE%"" tally-sync.py >> ""%INSTALL_DIR%\sync.log"" 2^>^&1", 0, False
) > "%INSTALL_DIR%\start_silent.vbs"

:: 8. Create a quick helper to view live logs
(
echo @echo off
echo title SobhaInfra ERP - Live Sync Log Monitor
echo color 0A
echo ============================================================
echo   SOBHAINFRA ERP - TALLY SYNC LIVE LOGS
echo   (Press Ctrl+C to exit monitor - Sync keeps running in background)
echo ============================================================
echo.
echo if not exist "%INSTALL_DIR%\sync.log" type nul ^> "%INSTALL_DIR%\sync.log"
echo powershell -NoProfile -Command "Get-Content -Path '%INSTALL_DIR%\sync.log' -Wait -Tail 30"
) > "%INSTALL_DIR%\view_sync_log.bat"

:: Also put view_sync_log.bat on Desktop for easy monitoring
if exist "%USERPROFILE%\Desktop" (
    copy /y "%INSTALL_DIR%\view_sync_log.bat" "%USERPROFILE%\Desktop\Check_Tally_Sync_Logs.bat" >nul 2>&1
)

:: 9. Register Scheduled Task (Runs on logon, highest privileges, hidden)
echo [*] Registering Windows Scheduled Task (%TASK_NAME%)...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\start_silent.vbs\"" /sc ONLOGON /ru "%USERNAME%" /rl HIGHEST /f >nul 2>&1
if %errorlevel% neq 0 (
    schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\start_silent.vbs\"" /sc ONLOGON /rl HIGHEST /f >nul 2>&1
)

:: 10. Kill any old zombie tally-sync instance and start fresh now
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -and $_.Name -ne 'powershell.exe' } | Stop-Process -Force" >nul 2>&1
wmic process where "commandline like '%%tally-sync.py%%' and not name='wmic.exe'" call terminate >nul 2>&1
wscript.exe "%INSTALL_DIR%\start_silent.vbs"

echo.
echo ============================================================
echo   SETUP COMPLETE! AUTO-START IS CONFIGURED & RUNNING
echo ============================================================
echo.
echo  [x] Runs automatically whenever Windows boots/logs in.
echo  [x] Completely invisible in background (no black cmd window).
echo  [x] Continuous sync: checks Tally every 5 minutes.
echo  [x] If Tally is closed, it waits and automatically connects
echo      as soon as the client opens TallyPrime.
echo.
echo  Installation: %INSTALL_DIR%
echo  Live Logs:    %INSTALL_DIR%\sync.log
echo  Desktop Tool: "Check_Tally_Sync_Logs.bat"
echo.
echo  NOTE FOR CLIENT:
echo  The client just needs to open TallyPrime as usual.
echo  Nothing else is required!
echo ============================================================
echo.
pause
