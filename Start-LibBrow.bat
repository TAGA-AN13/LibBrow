@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import tkinter" >nul 2>nul
  if not errorlevel 1 goto run_with_py
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import tkinter" >nul 2>nul
  if not errorlevel 1 goto run_with_python
)

echo Python 3 was not found.
echo Install Python 3 from python.org, enable "Add python.exe to PATH",
echo then double-click this file again.
pause
exit /b 1

:run_with_py
py -3 "%~dp0libbrow_launcher.py"
exit /b %errorlevel%

:run_with_python
python "%~dp0libbrow_launcher.py"
exit /b %errorlevel%
