@echo off
title SobhaInfra ERP - Tally Sync Status ^& Diagnostics
color 0B
cd /d "%~dp0"

echo ============================================================
echo   SOBHAINFRA ERP - TALLY SYNC STATUS ^& DIAGNOSTICS
echo ============================================================
echo.

:: 1. Check Background Sync Process
echo [*] Step 1: Checking if Background Sync is running...
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -and $_.Name -ne 'powershell.exe' }; if ($p) { Write-Host '  [OK] SYNC SERVICE IS ACTIVELY RUNNING (PID: ' $p.ProcessId ')' -ForegroundColor Green } else { Write-Host '  [WARNING] Sync service is NOT currently running!' -ForegroundColor Yellow }"
echo.

:: 2. Check TallyPort 9000
echo [*] Step 2: Checking TallyPrime connection on port 9000...
powershell -NoProfile -Command "$t = Test-NetConnection -ComputerName 127.0.0.1 -Port 9000 -WarningAction SilentlyContinue; if ($t.TcpTestSucceeded) { Write-Host '  [OK] TALLYPRIME IS CONNECTED ^& RESPONDING ON PORT 9000' -ForegroundColor Green } else { Write-Host '  [!] TallyPrime port 9000 is not responding.' -ForegroundColor Red; Write-Host '      Please make sure TallyPrime is open.' -ForegroundColor Yellow; Write-Host '      (In Tally: F1 Help -^> Settings -^> Connectivity -^> Client/Server: Both, Port: 9000)' -ForegroundColor Gray }"
echo.

:: 3. Show recent log lines
echo [*] Step 3: Recent Sync Activity:
echo ------------------------------------------------------------
if exist "sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'sync.log' -Tail 15"
) else if exist "tally-sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'tally-sync.log' -Tail 15"
) else if exist "C:\Users\Public\Automation\sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'C:\Users\Public\Automation\sync.log' -Tail 15"
) else if exist "C:\Users\Public\Automation\tally-sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'C:\Users\Public\Automation\tally-sync.log' -Tail 15"
) else (
    echo [Waiting for first sync cycle to write logs...]
)
echo ------------------------------------------------------------
echo.
echo Options:
echo   [1] Watch live streaming logs
echo   [2] Start / Restart sync in background now
echo   [3] Exit
echo.
set /p "CHOICE=Enter choice [1, 2, or 3]: "
if "%CHOICE%"=="1" goto STREAM_LOGS
if "%CHOICE%"=="2" goto RESTART_SYNC
goto END

:STREAM_LOGS
cls
echo Streaming live sync logs... (Press Ctrl+C to return)
if exist "sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'sync.log' -Wait -Tail 25"
) else if exist "tally-sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'tally-sync.log' -Wait -Tail 25"
) else if exist "C:\Users\Public\Automation\sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'C:\Users\Public\Automation\sync.log' -Wait -Tail 25"
) else if exist "C:\Users\Public\Automation\tally-sync.log" (
    powershell -NoProfile -Command "Get-Content -Path 'C:\Users\Public\Automation\tally-sync.log' -Wait -Tail 25"
)
pause
goto END

:RESTART_SYNC
echo.
echo [*] Terminating old sync instances...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tally-sync.py*' -and $_.Name -ne 'powershell.exe' } | Stop-Process -Force"
echo [*] Starting fresh sync process...
if exist "start_silent.vbs" (
    wscript.exe "start_silent.vbs"
) else if exist "C:\Users\Public\Automation\start_silent.vbs" (
    wscript.exe "C:\Users\Public\Automation\start_silent.vbs"
) else (
    start /b python tally-sync.py >> sync.log 2>&1
)
timeout /t 2 >nul
echo [OK] Started! Run this tool again to verify.
pause
goto END

:END
exit /b 0
