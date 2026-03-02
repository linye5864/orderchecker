@echo off
REM OrderComparer API 测试脚本 (Windows)
REM 使用方法: double-click run-tests.bat 或在命令行执行

echo ============================================
echo   OrderComparer API 测试脚本
echo ============================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查服务器是否运行
echo [1/3] 检查服务器状态...
curl -s http://localhost:3001/api/v1/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [完成] 服务器已运行
    goto run_tests
)

echo [提示] 服务器未运行，正在启动...
echo.

REM 启动服务器
echo [2/3] 启动服务器...
start "OrderComparer Server" cmd /c "cd /d %~dp0packages\server && yarn dev"

REM 等待服务器启动
echo [3/3] 等待服务器启动...
set /a count=0
:wait_loop
timeout /t 2 /nobreak >nul
set /a count+=1
curl -s http://localhost:3001/api/v1/health >nul 2>&1
if %errorlevel% neq 0 (
    if %count% lss 15 (
        echo  等待中... (%count% 次)
        goto wait_loop
    )
    echo [警告] 服务器启动超时，继续测试...
)

:run_tests
echo.
echo ============================================
echo   运行 API 测试
echo ============================================
echo.

REM 运行测试脚本
cd /d %~dp0packages\server
node test-api.js

echo.
echo ============================================
echo   测试完成
echo ============================================
pause
