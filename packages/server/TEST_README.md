# OrderComparer API 测试指南

## 快速开始

### 1. 启动后端服务器

```bash
# 在 orderchecker 目录下
cd packages/server
yarn dev
```

服务器将在 `http://localhost:3001` 启动

### 2. 运行测试

#### 方式一: 快速测试 (推荐)

```bash
# 启动服务器后，新开一个终端运行
cd packages/server
node test-api.js
```

#### 方式二: 完整测试报告

```bash
cd packages/server
node run-tests.js --verbose
```

#### 方式三: 快速验证脚本 (Linux/macOS)

```bash
chmod +x test-server.sh
./test-server.sh
```

#### 方式四: Windows 批处理脚本

```batch
run-tests.bat
```

---

## 测试脚本说明

| 脚本 | 功能 | 使用场景 |
|------|------|----------|
| `test-api.js` | 完整 API 测试 | 详细测试报告 |
| `run-tests.js` | 高级测试套件 | CI/CD、需要详细输出时 |
| `test-server.sh` | 快速验证 | 快速检查服务器状态 |
| `run-tests.bat` | Windows 快速测试 | Windows 用户 |

---

## 命令行选项

### run-tests.js

```bash
node run-tests.js [选项]

选项:
  --quick     快速模式
  --verbose   详细输出
  --watch     监听模式
  --help      显示帮助
```

---

## 手动 API 测试

### 1. 登录获取 Token

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 响应
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "...",
      "username": "admin",
      "role": "SUPER_ADMIN",
      "status": "ACTIVE"
    }
  },
  "message": "登录成功"
}
```

### 2. 使用 Token 访问受保护路由

```bash
TOKEN="你的token值"

# 获取用户列表
curl http://localhost:3001/api/v1/users \
  -H "Authorization: Bearer $TOKEN"

# 获取平台配置
curl http://localhost:3001/api/v1/platforms \
  -H "Authorization: Bearer $TOKEN"

# 获取任务列表
curl http://localhost:3001/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN"
```

---

## 测试账号

| 角色 | 用户名 | 密码 | 权限 |
|------|--------|------|------|
| 超级管理员 | admin | admin123 | 全部权限 |
| 操作员 | operator | operator123 | 执行对账操作 |
| 只读用户 | user | user12345 | 仅查看数据 |

---

## 预期测试结果

```
========================================
  OrderComparer API 测试
========================================

════════════════════════════════════════════════════
认证模块测试
────────────────────────────────────────────────--
✓ 管理员登录 (admin/admin123)
✓ 错误密码被拒绝
✓ 无 Token 被拒绝
✓ 无效 Token 被拒绝
✓ 获取当前用户

════════════════════════════════════════════════════
用户管理测试
────────────────────────────────────────────────--
✓ 获取用户列表
✓ 获取角色列表
✓ 用户分页查询
...

════════════════════════════════════════════════════
测试结果汇总
────────────────────────────────────────────────--
  测试总数:  25
  通过:      25 ✓
  失败:      0
  通过率:    100%
  耗时:      2.45s

════════════════════════════════════════════════════
🎉 所有测试通过!
```
