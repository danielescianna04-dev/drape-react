@echo off
echo ========================================
echo Force Restart - Drape Mobile IDE
echo ========================================
echo.

REM Kill ALL node processes
echo [1/3] Killing all node processes...
taskkill /F /IM node.exe 2>NUL
timeout /t 3 /nobreak > NUL

REM Clear caches
echo [2/3] Clearing caches...
if exist .expo rmdir /s /q .expo 2>NUL
if exist node_modules\.cache rmdir /s /q node_modules\.cache 2>NUL

REM Get current IP
echo [3/3] Detecting IP and starting services...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"Indirizzo IPv4" ^| findstr "192.168"') do (
    set IP=%%a
)
set IP=%IP: =%

REM Update config files
powershell -Command "(Get-Content .env) -replace 'EXPO_PUBLIC_API_URL=http://192\.168\.\d+\.\d+:3000/', 'EXPO_PUBLIC_API_URL=http://%IP%:3000/' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'EXPO_PUBLIC_WS_URL=ws://192\.168\.\d+\.\d+:3000', 'EXPO_PUBLIC_WS_URL=ws://%IP%:3000' | Set-Content .env"
powershell -Command "(Get-Content package.json) -replace 'REACT_NATIVE_PACKAGER_HOSTNAME=192\.168\.\d+\.\d+', 'REACT_NATIVE_PACKAGER_HOSTNAME=%IP%' | Set-Content package.json"

echo.
echo Starting Backend...
start "Drape Backend" cmd /k "cd backend && node server.js"

timeout /t 3 /nobreak > NUL

echo Starting Frontend...
start "Drape Frontend" cmd /k "npm start -- --clear --lan"

echo.
echo ========================================
echo Services restarted!
echo Backend: http://%IP%:3000
echo ========================================
pause
