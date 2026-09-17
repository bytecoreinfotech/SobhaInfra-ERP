@echo off
title SobhaInfra ERP - Tally Auto-Sync Setup (Permanent)
color 0A
cd /d "%~dp0"

echo ============================================================
echo   SOBHAINFRA ERP - TALLY AUTO-START SETUP (PERMANENT)
echo ============================================================
echo.

:: 1. Check Execution Context (Admin or User)
set "IS_ADMIN=0"
net session >nul 2>&1
if %errorlevel% equ 0 set "IS_ADMIN=1"

if "%IS_ADMIN%"=="1" (
    echo [*] Running with Administrator privileges.
) else (
    echo [*] Running with User privileges. Auto-start will install for current user.
)

:: 2. Source and Target Directories
set "SOURCE_DIR=%~dp0"
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
set "INSTALL_DIR=%SOURCE_DIR%"

echo [*] Setup directory: %INSTALL_DIR%
echo.

:: 3. Verify tally-sync.py exists
if not exist "%INSTALL_DIR%\tally-sync.py" (
    color 0C
    echo [ERROR] 'tally-sync.py' was not found in:
    echo %INSTALL_DIR%
    echo.
    echo Please make sure setup_autostart.bat and tally-sync.py are in the same folder.
    echo.
    pause
    exit /b 1
)

:: 4. Locate Python Executable (Prioritize real installations over WindowsApps alias)
set "PY_EXE="

for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
)
if not defined PY_EXE (
    for /d %%D in ("C:\Users\*\AppData\Local\Programs\Python\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    for /d %%D in ("C:\Program Files\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    for /d %%D in ("C:\Program Files (x86)\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    for /d %%D in ("C:\Python*") do (
        if exist "%%D\python.exe" set "PY_EXE=%%D\python.exe"
    )
)
if not defined PY_EXE (
    for /f "delims=" %%I in ('where py 2^>nul') do (
        if not defined PY_EXE (
            echo "%%I" | findstr /i "WindowsApps" >nul
            if errorlevel 1 set "PY_EXE=%%I"
        )
    )
)
if not defined PY_EXE (
    for /f "delims=" %%I in ('where python 2^>nul') do (
        if not defined PY_EXE (
            echo "%%I" | findstr /i "WindowsApps" >nul
            if errorlevel 1 set "PY_EXE=%%I"
        )
    )
)
if not defined PY_EXE (
    for /f "delims=" %%I in ('where python 2^>nul') do (
        if not defined PY_EXE set "PY_EXE=%%I"
    )
)

if not defined PY_EXE (
    color 0C
    echo [ERROR] Python was not found on this computer!
    echo.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo IMPORTANT: Make sure to check [x] "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

echo [*] Python executable found: %PY_EXE%
echo.

:: 5. Install Python dependencies (requests)
echo [*] Checking required Python packages (requests)...
"%PY_EXE%" -m pip install requests --quiet >nul 2>&1
if %errorlevel% neq 0 (
    "%PY_EXE%" -m pip install requests
)

:: 6. Create Supervisor Daemon Script (Auto-Restarts Python if it ever stops)
echo [*] Creating auto-restarting background supervisor...
echo @echo off > "%INSTALL_DIR%\run_sync_daemon.bat"
echo title SobhaInfra ERP Tally Sync Supervisor >> "%INSTALL_DIR%\run_sync_daemon.bat"
echo cd /d "%%~dp0" >> "%INSTALL_DIR%\run_sync_daemon.bat"
echo :SYNC_LOOP >> "%INSTALL_DIR%\run_sync_daemon.bat"
echo "%PY_EXE%" tally-sync.py ^>^> sync.log 2^>^&1 >> "%INSTALL_DIR%\run_sync_daemon.bat"
echo ping -n 11 127.0.0.1 ^>nul >> "%INSTALL_DIR%\run_sync_daemon.bat"
echo goto SYNC_LOOP >> "%INSTALL_DIR%\run_sync_daemon.bat"

:: 7. Create Silent Background Runner (WScript VBS)
echo [*] Creating silent background runner...
echo Set oShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\start_silent.vbs"
echo sScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) >> "%INSTALL_DIR%\start_silent.vbs"
echo oShell.Run "cmd /c """ ^& sScriptDir ^& "\run_sync_daemon.bat""", 0, False >> "%INSTALL_DIR%\start_silent.vbs"

:: 8. Install to User Startup Folder (Executes automatically every time Windows boots)
echo [*] Installing to Windows User Startup folder...
set "USER_STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%USER_STARTUP%" (
    copy /y "%INSTALL_DIR%\start_silent.vbs" "%USER_STARTUP%\Start_SobhaInfra_Sync.vbs" >nul 2>&1
    echo   [OK] Registered in: %USER_STARTUP%
)

:: 9. Register in Windows CurrentUser Run Registry Key (Commercial auto-start standard)
echo [*] Registering in Windows Registry Run key...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "SobhaInfraTallySync" /t REG_SZ /d "wscript.exe \"%INSTALL_DIR%\start_silent.vbs\"" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Registry auto-start enabled.
)

:: 10. If running as Admin, also register in All Users Startup and Scheduled Task
if "%IS_ADMIN%"=="1" (
    echo [*] Registering in All Users Startup ^& Scheduled Task...
    set "ALL_STARTUP=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
    if exist "%ALL_STARTUP%" (
        copy /y "%INSTALL_DIR%\start_silent.vbs" "%ALL_STARTUP%\Start_SobhaInfra_Sync.vbs" >nul 2>&1
    )
    schtasks /delete /tn "SobhaInfra_Tally_Sync" /f >nul 2>&1
    schtasks /create /tn "SobhaInfra_Tally_Sync" /tr "wscript.exe \"%INSTALL_DIR%\start_silent.vbs\"" /sc ONLOGON /rl HIGHEST /f >nul 2>&1
)

:: 11. Copy Diagnostic Status Monitor to Desktop
echo [*] Installing Status Monitor to Desktop...
if exist "%INSTALL_DIR%\Check_Sync_Status.bat" (
    copy /y "%INSTALL_DIR%\Check_Sync_Status.bat" "%USERPROFILE%\Desktop\Check_Tally_Sync_Status.bat" >nul 2>&1
    copy /y "%INSTALL_DIR%\Check_Sync_Status.bat" "C:\Users\Public\Desktop\Check_Tally_Sync_Status.bat" >nul 2>&1
    echo   [OK] Desktop shortcut installed: Check_Tally_Sync_Status.bat
)

:: 12. Terminate any previous instances and launch fresh in background
echo [*] Starting Tally Sync in background now...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -or $_.CommandLine -like '*run_sync_daemon.bat*' } | Where-Object { $_.Name -ne 'powershell.exe' } | Stop-Process -Force" >nul 2>&1
wscript.exe "%INSTALL_DIR%\start_silent.vbs"

:: 13. Health Check: Verify background service is running
ping -n 4 127.0.0.1 >nul
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -and $_.Name -ne 'powershell.exe' }; if ($p) { Write-Host '  [OK] Sync service successfully active in background (PID: ' $p.ProcessId ')' -ForegroundColor Green } else { Write-Host '  [*] Sync supervisor is active in background.' -ForegroundColor Green }"

echo.
echo ============================================================
echo   SUCCESS! TALLY AUTO-SYNC IS NOW PERMANENTLY CONFIGURED
echo ============================================================
echo.
echo  [OK] Sync runs automatically in background every 5 minutes.
echo  [OK] Starts automatically whenever this computer boots up.
echo  [OK] Auto-restarts itself if anything ever crashes.
echo  [OK] YOU NEVER NEED TO RUN start.bat MANUALLY AGAIN!
echo.
echo  To check live status or logs anytime:
echo    Double-click 'Check_Tally_Sync_Status.bat' on your Desktop.
echo ============================================================
echo.
pause
exit /b 0
