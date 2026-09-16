@echo off
title SobhaInfra ERP - Client PC Auto-Start Setup
color 0A
cd /d "%~dp0"

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

:: 2. Source and Target Directories
set "SOURCE_DIR=%~dp0"
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
set "INSTALL_DIR=%SOURCE_DIR%"

echo [*] Setup running from: %SOURCE_DIR%
echo.

:: 3. Verify tally-sync.py exists
if not exist "%SOURCE_DIR%\tally-sync.py" (
    color 0C
    echo [ERROR] 'tally-sync.py' was not found in:
    echo %SOURCE_DIR%
    echo.
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
    for /d %%D in ("C:\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)

if not defined PY_EXE (
    color 0C
    echo [ERROR] Python was not found on this computer!
    echo.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo IMPORTANT: During installation, make sure to check:
    echo    [x] "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

echo [*] Python executable found: %PY_EXE%
echo.

:: 5. Install Python dependencies
echo [*] Checking required Python packages (requests)...
"%PY_EXE%" -m pip install requests --quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing requests...
    "%PY_EXE%" -m pip install requests
)

:: 6. Create silent background launcher (WScript VBS)
echo [*] Creating silent background runner...
echo Set oShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\start_silent.vbs"
echo oShell.Run "cmd /c cd /d ""%INSTALL_DIR%"" ^&^& ""%PY_EXE%"" tally-sync.py >> ""%INSTALL_DIR%\sync.log"" 2^>^&1", 0, False >> "%INSTALL_DIR%\start_silent.vbs"

:: 7. Copy Diagnostic Monitor to Desktop
echo [*] Installing Desktop Status Monitor...
if exist "%SOURCE_DIR%\Check_Sync_Status.bat" (
    copy /y "%SOURCE_DIR%\Check_Sync_Status.bat" "C:\Users\Public\Desktop\Check_Tally_Sync_Status.bat" >nul 2>&1
    copy /y "%SOURCE_DIR%\Check_Sync_Status.bat" "%USERPROFILE%\Desktop\Check_Tally_Sync_Status.bat" >nul 2>&1
)

:: 8. Install to Windows "All Users" Startup Folder (Runs automatically on PC restart)
echo [*] Installing to Windows All Users Startup folder...
set "ALL_STARTUP=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%ALL_STARTUP%" (
    copy /y "%INSTALL_DIR%\start_silent.vbs" "%ALL_STARTUP%\Start_SobhaInfra_Sync.vbs" >nul 2>&1
)

:: 9. Register Windows Scheduled Task as secondary fallback
echo [*] Registering Windows Scheduled Task (SobhaInfra_Tally_Sync)...
schtasks /delete /tn "SobhaInfra_Tally_Sync" /f >nul 2>&1
schtasks /create /tn "SobhaInfra_Tally_Sync" /tr "wscript.exe \"%INSTALL_DIR%\start_silent.vbs\"" /sc ONLOGON /rl HIGHEST /f >nul 2>&1

:: 10. Terminate any previous sync instances and launch fresh
echo [*] Starting sync service in background now...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -and $_.Name -ne 'powershell.exe' } | Stop-Process -Force" >nul 2>&1
wscript.exe "%INSTALL_DIR%\start_silent.vbs"

echo.
echo ============================================================
echo   SETUP COMPLETE! AUTO-START IS CONFIGURED ^& RUNNING
echo ============================================================
echo.
echo  [OK] Sync runs automatically in background whenever Windows starts.
echo  [OK] Completely silent (no black command prompt window).
echo  [OK] Auto-reconnects as soon as TallyPrime is opened.
echo.
echo  DESKTOP TOOL INSTALLED:
echo    "Check_Tally_Sync_Status.bat"
echo    Double-click this anytime to verify sync status, port 9000,
echo    and view live logs!
echo ============================================================
echo.
pause
exit /b 0
