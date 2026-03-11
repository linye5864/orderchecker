# OrderChecker 项目开发指南

本文件为 Agent 开发者提供项目上下文、构建命令和代码风格指南。

---

## 一、项目概述

OrderChecker 是物流配送行业的企业级订单对账管理系统，通过三方数据交叉验证（配送单、平台账单、流水单）实现自动化对账。

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript 5 + Vite 5 + Tailwind CSS 3 + Zustand |
| 后端 | Python 3.10+ + FastAPI + SQLAlchemy 2.0 + Pydantic 2 |
| 部署 | Docker + Docker Compose + PostgreSQL + Redis |

---

## 二、构建与运行命令

### 2.1 前端 (packages/renderer)

```bash
cd packages/renderer && yarn dev      # 开发服务器 (端口 5173)
cd packages/renderer && yarn build    # 构建生产版本
cd packages/renderer && yarn typecheck # TypeScript 类型检查
```

### 2.2 后端 (packages/backend)

```bash
cd packages/backend && source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000  # 开发服务器
python e2e_test.py                 # E2E 集成测试
python local_reconciliation_test.py # 本地对账测试
alembic revision --autogenerate -m "描述"  # 数据库迁移
alembic upgrade head
```

### 2.3 根目录命令

```bash
yarn dev      # 同时启动前后端
yarn build    # 构建前端
yarn typecheck # 全局类型检查
```

### 2.4 Docker 部署

```bash
docker-compose up -d      # 构建并启动
docker-compose logs -f    # 查看日志
docker-compose down       # 停止服务
```

---

## 三、代码风格指南

### 3.1 Python 后端规范

**缩进与格式：**
- 使用 4 空格缩进，遵循 PEP 8，最大行长 120 字符

**命名规范：**
- 变量/函数：`snake_case`，类名：`PascalCase`，常量：`UPPER_SNAKE_CASE`，私有属性：前缀 `_`

**Import 顺序：**
```python
# 1. 标准库 -> 2. 第三方库 -> 3. 项目内部模块
import os
from fastapi import APIRouter
from app.core.database import get_db
```

**类型标注（强制）：**
```python
def process_order(order_id: str) -> dict[str, Any]: ...
async def get_user(user_id: int) -> User | None: ...
```

**错误处理：**
- 禁止使用裸 `except`，禁止使用 `print`，使用 `logging` 模块
- 全局错误响应使用 `app/core/responses.py` 中的 `success()` / `error()`

**分层结构（强制）：**
- `api/` - 请求解析与响应封装，`service/` - 业务逻辑处理，`model/` - ORM 模型定义
- 禁止在 api 层直接操作数据库

---

### 3.2 TypeScript 前端规范

**缩进与格式：**
- 使用 2 空格缩进

**命名规范：**
- 变量/函数：`camelCase`，组件/类型：`PascalCase`，文件名：`kebab-case`

**Import 顺序：**
```typescript
// 1. React/React Router -> 2. 第三方库 -> 3. 项目内部模块
import { useState } from 'react';
import axios from 'axios';
import { apiClient } from '@/lib/api';
```

**类型定义（强制）：**
- 使用 `interface` 定义对象类型，`type` 定义联合类型/别名，禁止使用 `any`

**组件规范：**
- 使用函数式组件 + Hooks，Props 必须使用 TypeScript 定义，非必传参数使用 `?`

**样式规范：**
- 使用 Tailwind CSS，使用 `class-variance-authority` 管理组件变体，使用 `clsx` + `tailwind-merge` 合并类名

---

## 四、API 调用规范

### 4.1 后端响应格式

使用 `app/core/responses.py` 中的统一响应格式：

```python
from app.core.responses import success, error
return success(data={"user_id": "123"}, message="操作成功")
return error("用户名或密码错误", code=401)
```

### 4.2 前端 API 客户端

统一使用 `packages/renderer/src/lib/api.ts` 中的 `apiClient`：

```typescript
import { apiClient } from '@/lib/api';
const user = await apiClient.get('/auth/me').then(res => res.data.data);
```

---

## 五、测试规范

- E2E 测试：`python e2e_test.py` - 模拟完整对账流程
- 本地测试：`python local_reconciliation_test.py` - 对账逻辑验证

---

## 六、数据库规范

使用 SQLAlchemy 2.0 风格，迁移使用 Alembic：

```bash
alembic revision --autogenerate -m "描述"
alembic upgrade head
```

---

## 七、默认账号

- 用户名：`admin`
- 密码：`admin123`

---

## 八、关键文件位置

| 功能 | 文件路径 |
|------|----------|
| 后端入口 | `packages/backend/app/main.py` |
| 对账引擎 | `packages/backend/app/services/reconciliation_engine_v2.py` |
| 前端入口 | `packages/renderer/src/main.tsx` |
| API 客户端 | `packages/renderer/src/lib/api.ts` |
| 状态管理 | `packages/renderer/src/store/` |
| 类型定义 | `packages/renderer/src/types/` |
