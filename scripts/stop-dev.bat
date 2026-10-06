@echo off
setlocal
title Stop Quanta Challenge

echo ============================================
echo   Stopping Quanta Challenge
echo ============================================

echo [1/4] Releasing ports 3000 / 1888 (scoped to this project only)...
REM 不再执行 taskkill /IM node.exe：共用实验机器上会误杀他人的 Node 进程。
REM 只结束确实占用本项目端口的进程。
call :killPort 3000
call :killPort 1888
echo       Done

echo [2/4] Stopping Judge/Live-Server containers...
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-judge-machine-agent" 2^>nul') do docker rm -f %%i >nul 2>&1
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-live-server-agent" 2^>nul') do docker rm -f %%i >nul 2>&1
echo       Done

echo [3/4] Stopping PostgreSQL and Redis...
docker stop quanta-challenge-postgres-1 quanta-challenge-redis-1 >nul 2>&1
echo       Done

echo [4/4] Verifying ports are free...
timeout /t 2 /nobreak >nul
set "LEAKED="
for %%p in (3000 1888) do (
    for /f "tokens=5" %%i in ('netstat -ano -p tcp ^| findstr /r /c:":%%p .*LISTENING"') do (
        echo       [!] Port %%p still held by PID %%i
        set "LEAKED=1"
    )
)
if defined LEAKED (
    echo.
    echo       [X] 仍有端口未被释放。若进程不是本项目启动的，请手动确认后再处理。
) else (
    echo       Done
)

echo.
echo All stopped.
pause
exit /b 0

:killPort
REM 仅结束监听指定端口的进程
set "PORT=%~1"
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    echo       Killing PID %%p on port %PORT%
    taskkill /F /PID %%p >nul 2>&1
)
exit /b 0
