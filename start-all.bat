@echo off
echo ========================================
echo Starting Drape Mobile IDE
echo ========================================
echo.

REM Kill existing node processes to avoid conflicts
echo [1/5] Cleaning up existing processes...
taskkill /F /IM node.exe 2>NUL
timeout /t 2 /nobreak > NUL

REM Clear caches
echo [2/5] Clearing caches...
if exist .expo rmdir /s /q .expo 2>NUL
if exist node_modules\.cache rmdir /s /q node_modules\.cache 2>NUL

REM Detect current WiFi IP
echo [3/5] Detecting WiFi IP address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"Indirizzo IPv4" ^| findstr "192.168"') do (
    set IP=%%a
)
REM Remove leading spaces
set IP=%IP: =%
echo Found WiFi IP: %IP%

REM Update .env and package.json with current IP
echo [4/5] Updating .env and package.json with current IP...
powershell -Command "(Get-Content .env) -replace 'EXPO_PUBLIC_API_URL=http://192\.168\.\d+\.\d+:3000/?', 'EXPO_PUBLIC_API_URL=http://%IP%:3000' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'EXPO_PUBLIC_WS_URL=ws://192\.168\.\d+\.\d+:3000/?', 'EXPO_PUBLIC_WS_URL=ws://%IP%:3000' | Set-Content .env"
powershell -Command "(Get-Content package.json) -replace 'REACT_NATIVE_PACKAGER_HOSTNAME=192\.168\.\d+\.\d+', 'REACT_NATIVE_PACKAGER_HOSTNAME=%IP%' | Set-Content package.json"
echo Files updated with IP: %IP%

REM Start backend in a new window
echo [5/5] Starting backend and frontend...
echo.
start "Drape Backend" cmd /k "cd backend && node server.js"

REM Wait a bit for backend to start
timeout /t 3 /nobreak > NUL

REM Start frontend in another new window
start "Drape Frontend" cmd /k "npm start"

echo.
echo ========================================
echo Both services started!
echo ========================================
echo Backend: http://%IP%:3000
echo Frontend: Check the Expo window
echo.
echo Your WiFi IP is: %IP%
echo Make sure your phone is on the same WiFi network!
echo.
echo Press any key to exit this window (services will keep running)...
pause > NUL
