@echo off
setlocal
cd /d "%~dp0"
python tools\apply_kruizly_hub_dashboard_fix.py
if errorlevel 1 (
  echo.
  echo FIX FAILED. Read the error above.
  pause
  exit /b 1
)
echo.
echo KRUIZLY Hub Dashboard fix completed.
echo Refresh your browser with Ctrl+F5.
pause
