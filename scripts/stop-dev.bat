@echo off
title Stop Quanta Challenge

echo ============================================
echo   Stopping Quanta Challenge
echo ============================================

echo Stopping Node processes...
taskkill /F /IM node.exe >nul 2>&1

echo Stopping Judge/Live-Server containers...
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-judge-machine-agent" 2^>nul') do docker rm -f %%i >nul 2>&1
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-live-server-agent" 2^>nul') do docker rm -f %%i >nul 2>&1

echo Stopping PostgreSQL and Redis...
docker stop quanta-challenge-postgres-1 quanta-challenge-redis-1 >nul 2>&1

echo.
echo All stopped.
pause
