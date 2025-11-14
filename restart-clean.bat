@echo off
echo ========================================
echo Drape Backend - Clean Restart
echo ========================================
echo.

echo [1/3] Killing all Node.js processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% == 0 (
    echo ✓ Node processes killed
) else (
    echo ✓ No Node processes running
)
echo.

echo [2/3] Waiting 3 seconds for cleanup...
timeout /t 3 /nobreak > nul
echo ✓ Cleanup complete
echo.

echo [3/3] Starting backend with updated code...
cd backend
start "Drape Backend" cmd /k "node server.js"
echo ✓ Backend started in new window
echo.

echo ========================================
echo Done! Backend is running.
echo Now open the app and click "Avvia Server"
echo ========================================
pause
