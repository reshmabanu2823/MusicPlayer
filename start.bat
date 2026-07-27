@echo off
title Musicify — Starting Server
echo.
echo  ==============================================
echo    MUSICIFY — Music Streaming App
echo  ==============================================
echo.

:: Check if node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo  Please install it from https://nodejs.org
    pause
    exit /b 1
)

:: Check if node_modules exist, if not install them
if not exist "music-backend\node_modules" (
    echo  [INFO] Installing backend dependencies...
    cd music-backend
    npm install
    cd ..
    echo  [INFO] Dependencies installed.
    echo.
)

:: Check if MongoDB is running
echo  [INFO] Checking MongoDB...
sc query MongoDB >nul 2>&1
if %errorlevel% neq 0 (
    echo  [WARNING] MongoDB service not found as a Windows service.
    echo  Make sure MongoDB is running (mongod.exe).
    echo  If not installed, download from https://www.mongodb.com/try/download/community
    echo.
)

:: Start the backend server and open the browser
echo  [INFO] Starting Musicify server...
echo  [INFO] Frontend will be available at: http://localhost:3000
echo.
cd music-backend

:: Open browser after a short delay
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

:: Start server (this keeps the window open)
node server.js

pause
