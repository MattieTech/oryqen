@echo off
title ORYQEN AI Assistant
color 0F
cls

echo =====================================================================
echo                    ORYQEN AI - General-Purpose AI Assistant
echo                    Offline and Online AI Modes
echo =====================================================================
echo.

echo [1/3] Checking Ollama local AI engine...
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    echo   [OK] Ollama daemon is active and responding.
) else (
    echo   [INFO] Starting Ollama daemon...
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ) else (
        start "" ollama serve
    )
    timeout /t 3 /nobreak >nul
)

echo.
echo [2/3] Detecting Python environment...
set "PY_CMD="

if exist "%~dp0backend\venv\Scripts\python.exe" (
    "%~dp0backend\venv\Scripts\python.exe" -c "import sys; sys.exit(0)" >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        set "PY_CMD=%~dp0backend\venv\Scripts\python.exe"
    )
)

if "%PY_CMD%"=="" if exist "C:\Users\PC\Downloads\anaconda\python.exe" (
    "C:\Users\PC\Downloads\anaconda\python.exe" -c "import sys; sys.exit(0)" >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        set "PY_CMD=C:\Users\PC\Downloads\anaconda\python.exe"
    )
)

if "%PY_CMD%"=="" (
    py -3 -c "import sys; sys.exit(0)" >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        set "PY_CMD=py -3"
    )
)

if "%PY_CMD%"=="" (
    python -c "import sys; sys.exit(0)" >nul 2>&1
    if "%ERRORLEVEL%"=="0" (
        set "PY_CMD=python"
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] No working Python 3 installation found!
    echo Please ensure Python or Anaconda is installed and added to PATH.
    pause
    exit /b 1
)

echo   [OK] Using Python: %PY_CMD%

echo.
echo [3/3] Starting ORYQEN backend on http://localhost:8000 ...
cd /d "%~dp0backend"

REM Launch browser in background after 2 seconds
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

"%PY_CMD%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause

