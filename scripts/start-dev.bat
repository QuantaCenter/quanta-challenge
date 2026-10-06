@echo off
setlocal
title Quanta Challenge Dev

REM 脚本已移入 scripts\，仓库根目录是其上一级；
REM 允许通过环境变量覆盖仓库根目录，避免把某个人的绝对路径写死在脚本里
if "%QUANTA_ROOT%"=="" set "QUANTA_ROOT=%~dp0.."
if "%QUANTA_ROOT:~-1%"=="\" set "QUANTA_ROOT=%QUANTA_ROOT:~0,-1%"

echo ============================================
echo   Quanta Challenge - Start All Services
echo ============================================
echo   Root: %QUANTA_ROOT%
echo.

echo [0/7] Checking Docker...
docker ps >nul 2>&1
if errorlevel 1 (
    echo       Docker not running, starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo       Waiting 30s for Docker to start...
    timeout /t 30 /nobreak >nul
) else (
    echo       Docker is running
)

echo [1/7] Releasing ports 3000 / 1888 (scoped to this project only)...
REM 不再执行 taskkill /IM node.exe：共用实验机器上会误杀他人的 Node 进程。
REM 只结束确实占用本项目端口的进程。
call :killPort 3000
call :killPort 1888
echo       Done

echo [2/7] Starting PostgreSQL + Redis...
REM 优先按容器名启动（快）；不存在则用 compose 创建。
REM 必须检查结果：依赖没起来时若继续往下走，最终表现为
REM "Web 能打开但数据库全报错、判题一直 pending"，很难定位。
docker start quanta-challenge-postgres-1 quanta-challenge-redis-1 >nul 2>&1
if errorlevel 1 (
    echo       [!] 直接启动失败，改用 compose 创建/启动...
    docker compose -f "%QUANTA_ROOT%\docker\docker-compose.development.yaml" up -d postgres redis
    if errorlevel 1 (
        echo.
        echo       [X] PostgreSQL / Redis 启动失败，后续服务无法工作。
        echo           请确认 Docker Desktop 正在运行，然后重试。
        pause
        exit /b 1
    )
)
echo       Done

echo [3/7] Cleaning old judge containers...
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-judge-machine-agent" 2^>nul') do docker rm -f %%i >nul 2>&1
for /f "tokens=*" %%i in ('docker ps -aq --filter "ancestor=challenge-live-server-agent" 2^>nul') do docker rm -f %%i >nul 2>&1
echo       Done

echo [4/7] Starting Scheduler (port 1888)...
start "Quanta-Scheduler" cmd /k "cd /d %QUANTA_ROOT%\packages\challenge-judge-scheduler && pnpm dev"
echo       Scheduler window opened

echo [5/7] Waiting for Scheduler (~15s)...
timeout /t 15 /nobreak >nul

echo [6/7] Starting Web App (port 3000)...
REM 使用 dev:watch：nuxt dev 若因连接层错误退出会自动重启，
REM 避免"服务突然消失、浏览器无法访问"。
start "Quanta-Web" cmd /k "cd /d %QUANTA_ROOT%\packages\challenge-web-app && pnpm dev:watch"
echo       Web app window opened

echo [7/7] Verifying Scheduler init...
timeout /t 10 /nobreak >nul
echo.

echo ============================================
echo   All services started!
echo   Wait ~30s for Web compilation, then open:
echo.
echo   http://localhost:3000
echo.
echo   管理员账号由仓库根目录/包内 .env 中的
echo   SUPER_ACCOUNT / SUPER_PASSWORD 决定。
echo   出于安全考虑，此脚本不再打印口令。
echo.
echo   自检命令（出问题时先跑这个）：
echo     cd packages\challenge-web-app ^&^& pnpm smoke
echo ============================================
echo.
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
