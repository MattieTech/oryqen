@echo off
setlocal EnableDelayedExpansion
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
if !ERRORLEVEL! equ 0 (
    echo   [OK] Ollama daemon is active and responding.
) else (
    echo   [INFO] Starting Ollama local AI daemon...
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
        start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        start "" /B "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve >nul 2>&1
    ) else (
        start "" /B ollama serve >nul 2>&1
    )
    REM Wait up to 6 seconds for daemon initialization
    for /L %%i in (1,1,6) do (
        powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
        if !ERRORLEVEL! equ 0 goto ollama_ready
        timeout /t 1 /nobreak >nul
    )
    :ollama_ready
    echo   [OK] Ollama daemon is active and ready.
)

echo.
echo [2/3] Detecting Python environment...
set "SYSTEM_PY="

REM Check system Python
py -3 -c "import sys; sys.exit(0)" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    set "SYSTEM_PY=py -3"
) else (
    python -c "import sys; sys.exit(0)" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "SYSTEM_PY=python"
    )
)

REM If virtual environment doesn't exist, create it automatically
if not exist "%~dp0backend\venv\Scripts\python.exe" (
    if "!SYSTEM_PY!"=="" (
        echo [ERROR] No working Python 3 installation found on your system!
        echo Please install Python 3.10+ from https://www.python.org/downloads/
        echo (Remember to check "Add python.exe to PATH" during installation)
        pause
        exit /b 1
    )
    echo   [INFO] First-time setup: Creating Python virtual environment...
    cd /d "%~dp0backend"
    !SYSTEM_PY! -m venv venv
    echo   [INFO] Installing required neural packages...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install --upgrade pip
    "%~dp0backend\venv\Scripts\python.exe" -m pip install -r requirements.txt
    cd /d "%~dp0"
    echo   [OK] Environment setup complete!
)

set "PY_CMD=%~dp0backend\venv\Scripts\python.exe"
echo   [OK] Using Python: !PY_CMD!

echo.
echo [3/3] Starting ORYQEN backend on http://localhost:8000 ...
cd /d "%~dp0backend"

REM Launch browser in background after 2 seconds
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

"!PY_CMD!" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
endlocal
