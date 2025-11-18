@echo off
echo ========================================
echo Stopping Drape Mobile IDE
echo ========================================
echo.

echo Killing all Node.js processes...
taskkill /F /IM node.exe 2>NUL

echo.
echo ========================================
echo All services stopped!
echo ========================================
echo.
pause
