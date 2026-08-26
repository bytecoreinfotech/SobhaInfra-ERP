@echo off
:: SOBHAINFRA ERP - Client PC Auto-Start Setup (Run ONCE as Admin)
echo ============================================================
echo   SOBHAINFRA ERP - Auto-Start Setup
echo ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Right-click and Run as Administrator
    pause
    exit /b 1
)
set SCRIPT_DIR=C:\Users\Public\Automation
set TASK_NAME=SobhaInfra_Tally_Sync
set PYTHON_EXE=python
echo Set oShell = CreateObject("WScript.Shell") > "%SCRIPT_DIR%\start_silent.vbs"
echo oShell.Run "cmd /c cd /d %SCRIPT_DIR% && python tally-sync.py >> %SCRIPT_DIR%\sync.log 2>&1", 0, False >> "%SCRIPT_DIR%\start_silent.vbs"
echo [1/3] Silent VBS launcher created.
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe ""%SCRIPT_DIR%\start_silent.vbs""" /sc ONLOGON /delay 0001:00 /ru "%USERNAME%" /rl HIGHEST /f
echo [2/3] Auto-start task registered (runs 1 min after login, silently).
wscript.exe "%SCRIPT_DIR%\start_silent.vbs"
echo [3/3] Sync started right now in background!
echo.
echo SETUP COMPLETE - Script runs every 5 min silently. Logs at %SCRIPT_DIR%\sync.log
echo Client just needs to keep Tally open - everything else is automatic!
pause
