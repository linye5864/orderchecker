#!/bin/bash
# OrderComparer API 快速测试脚本
# 使用方法: ./test-server.sh

echo "========================================"
echo "  OrderComparer API 测试"
echo "========================================"
echo ""

# 检查服务器
echo "[1/2] 检查服务器状态..."
HEALTH=$(curl -s http://localhost:3001/api/v1/health)
if echo "$HEALTH" | grep -q '"success":true'; then
    echo "  ✓ 服务器运行正常"
else
    echo "  ✗ 服务器未运行或出错"
    echo "  请先启动服务器: cd packages/server && yarn dev"
    exit 1
fi

echo ""
echo "[2/2] 运行 API 测试..."

# 登录获取 token
echo "  登录测试..."
LOGIN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}')

if echo "$LOGIN" | grep -q '"success":true'; then
    TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "  ✓ 登录成功"
    echo "    Token: ${TOKEN:0:30}..."
else
    echo "  ✗ 登录失败"
    echo "$LOGIN"
    exit 1
fi

echo ""
echo "  测试受保护路由..."
USERS=$(curl -s http://localhost:3001/api/v1/users \
    -H "Authorization: Bearer $TOKEN")

if echo "$USERS" | grep -q '"success":true'; then
    echo "  ✓ 获取用户列表成功"
    COUNT=$(echo "$USERS" | grep -o '"username"' | wc -l)
    echo "    用户数量: $COUNT"
else
    echo "  ✗ 获取用户列表失败"
fi

echo ""
echo "  测试平台配置..."
PLATFORMS=$(curl -s http://localhost:3001/api/v1/platforms \
    -H "Authorization: Bearer $TOKEN")

if echo "$PLATFORMS" | grep -q '"success":true'; then
    echo "  ✓ 获取平台配置成功"
    COUNT=$(echo "$PLATFORMS" | grep -o '"platformId"' | wc -l)
    echo "    平台数量: $COUNT"
else
    echo "  ✗ 获取平台配置失败"
fi

echo ""
echo "  测试任务列表..."
TASKS=$(curl -s http://localhost:3001/api/v1/tasks/stats \
    -H "Authorization: Bearer $TOKEN")

if echo "$TASKS" | grep -q '"success":true'; then
    echo "  ✓ 获取任务统计成功"
else
    echo "  ✗ 获取任务统计失败"
fi

echo ""
echo "========================================"
echo "  测试完成 ✓"
echo "========================================"
echo ""
echo "提示: 运行完整测试使用 node test-api.js"
