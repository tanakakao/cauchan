@echo off
setlocal EnableExtensions

rem Fixed ports reserved for the cauchan development web application.
rem bochan uses 8000 / 5173 and malchan uses 8001 / 5174.
set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=8002"
set "FRONTEND_HOST=127.0.0.1"
set "FRONTEND_PORT=5175"
set "HEALTH_URL=http://%BACKEND_HOST%:%BACKEND_PORT%/api/v1/health"
set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"

rem Pass the dedicated cauchan endpoints to FastAPI and Vite.
set "VITE_API_BASE_URL=http://%BACKEND_HOST%:%BACKEND_PORT%/api/v1"
set "CAUCHAN_CORS_ORIGINS=http://%FRONTEND_HOST%:%FRONTEND_PORT%,http://localhost:%FRONTEND_PORT%"

if /i "%~1"=="check" goto check
if /i "%~1"=="backend" goto backend
if /i "%~1"=="frontend" goto frontend

echo ========================================
echo cauchan Web launcher
echo ========================================
echo.
echo Reserved ports:
echo   Backend : %BACKEND_PORT%
echo   Frontend: %FRONTEND_PORT%
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found on PATH.
    echo Install Node.js and make sure npm is available.
    echo.
    pause
    exit /b 1
)

if exist "%VENV_PYTHON%" (
    echo Python: %VENV_PYTHON%
) else (
    where uv >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Neither .venv\Scripts\python.exe nor uv was found.
        echo Create the virtual environment in this repository or install uv.
        echo.
        pause
        exit /b 1
    )
    echo Python: uv run python
)

echo Checking whether the cauchan ports are available...
call :ensure_port_available "backend" %BACKEND_PORT%
if errorlevel 1 exit /b 1
call :ensure_port_available "frontend" %FRONTEND_PORT%
if errorlevel 1 exit /b 1

echo Starting cauchan backend at http://%BACKEND_HOST%:%BACKEND_PORT% ...
start "cauchan backend" /D "%~dp0" cmd.exe /k ""%~f0" backend"

echo Waiting for FastAPI to become ready...
call :wait_for_backend
if errorlevel 1 (
    echo.
    echo [ERROR] cauchan FastAPI did not become ready within 60 seconds.
    echo Check the cauchan backend window for the traceback or port error.
    echo The React frontend was not started.
    echo.
    pause
    exit /b 1
)

echo FastAPI is ready.
echo Starting cauchan frontend at http://%FRONTEND_HOST%:%FRONTEND_PORT% ...
start "cauchan frontend" /D "%~dp0web" cmd.exe /k ""%~f0" frontend"

echo.
echo Startup windows were opened.
echo Frontend: http://%FRONTEND_HOST%:%FRONTEND_PORT%
echo Backend : http://%BACKEND_HOST%:%BACKEND_PORT%
echo OpenAPI : http://%BACKEND_HOST%:%BACKEND_PORT%/docs
echo Health  : %HEALTH_URL%
echo.
echo bochan and malchan can remain running on their own reserved ports.
echo Press any key to close only this launcher window.
pause >nul
exit /b 0

:check
if not "%BACKEND_HOST%"=="127.0.0.1" exit /b 1
if not "%BACKEND_PORT%"=="8002" exit /b 1
if not "%FRONTEND_HOST%"=="127.0.0.1" exit /b 1
if not "%FRONTEND_PORT%"=="5175" exit /b 1
if not "%HEALTH_URL%"=="http://127.0.0.1:8002/api/v1/health" exit /b 1
if not "%VITE_API_BASE_URL%"=="http://127.0.0.1:8002/api/v1" exit /b 1
echo cauchan launcher configuration is valid.
exit /b 0

:ensure_port_available
powershell.exe -NoProfile -Command "$listener = $null; try { $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('%BACKEND_HOST%'), %~2); $listener.Start(); exit 0 } catch { exit 1 } finally { if ($null -ne $listener) { $listener.Stop() } }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] The cauchan %~1 port %~2 is already in use.
    echo Stop the process using that port or change the port settings in start_web.bat.
    echo.
    pause
    exit /b 1
)
exit /b 0

:wait_for_backend
for /L %%I in (1,1,60) do (
    powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1

:backend
cd /d "%~dp0"
echo ========================================
echo cauchan FastAPI backend
echo ========================================
echo.

if exist "%VENV_PYTHON%" (
    echo Using repository virtual environment:
    echo %VENV_PYTHON%
    echo.
    "%VENV_PYTHON%" -m uvicorn cauchan.api.app:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%
) else (
    echo .venv was not found. Starting through uv run.
    echo.
    uv run python -m uvicorn cauchan.api.app:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%
)

set "SERVER_EXIT=%ERRORLEVEL%"
echo.
echo [ERROR] cauchan backend stopped. Exit code: %SERVER_EXIT%
echo Check the error message above. This window will remain open.
pause
exit /b %SERVER_EXIT%

:frontend
cd /d "%~dp0web"
echo ========================================
echo cauchan React frontend
echo ========================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found on PATH.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo node_modules was not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

call npm run dev -- --host %FRONTEND_HOST% --port %FRONTEND_PORT% --strictPort
set "FRONTEND_EXIT=%ERRORLEVEL%"
echo.
echo [ERROR] cauchan frontend stopped. Exit code: %FRONTEND_EXIT%
echo Check the error message above. This window will remain open.
pause
exit /b %FRONTEND_EXIT%
