# OrderChecker 项目上下文

## 项目概述

OrderChecker 是一个企业级 Web 架构订单对账管理系统，专为物流配送行业设计。系统通过三方数据交叉验证（配送单、平台账单、流水账单），实现自动化对账、智能分析和风险预警。

### 核心功能

- **多平台支持**：闪送、达达、蜂鸟、顺丰、小哥配送、UU 等主流配送平台
- **三方对账**：配送单(应该扣) vs 流水单(实际扣) vs 三方账单(三方扣)
- **自动对账**：智能匹配订单，自动识别金额异常、订单缺失等问题
- **实时进度**：WebSocket 实时推送对账进度
- **数据可视化**：Dashboard 仪表板、趋势图表、平台分布
- **报表导出**：支持导出 Excel 格式的对账结果

---

## 技术架构

### 前端技术栈 (packages/renderer)

- **React 18** - 用户界面框架
- **Vite 5** - 构建工具
- **TypeScript 5** - 类型安全
- **Tailwind CSS 3** - 样式框架
- **Zustand** - 状态管理
- **React Router 6** - 路由管理
- **Axios** - HTTP 客户端
- **Recharts** - 图表库
- **xlsx** - Excel 导出
- **Lucide React** - 图标库

### 后端技术栈 (packages/backend)

- **Python 3.10+** - 运行环境
- **FastAPI** - Web 框架
- **SQLAlchemy 2.0** - ORM
- **Pydantic 2** - 数据验证
- **SQLite/PostgreSQL** - 数据库
- **Celery + Redis** - 异步任务队列
- **WebSocket** - 实时通信
- **Uvicorn** - ASGI 服务器
- **openpyxl/pandas** - Excel 处理

### 部署架构

- **Docker + Docker Compose** - 容器化部署
- **Nginx** - 反向代理和静态文件服务
- **PostgreSQL** - 生产数据库

---

## 项目结构

```
orderchecker/
├── packages/
│   ├── renderer/           # 前端 React 应用
│   │   ├── src/
│   │   │   ├── lib/        # API 客户端、工具函数
│   │   │   ├── pages/      # 页面组件
│   │   │   ├── components/ # UI 组件
│   │   │   ├── store/      # Zustand 状态管理
│   │   │   ├── types/      # TypeScript 类型定义
│   │   │   └── views/      # 视图组件 (AppShell, Login)
│   │   └── vite.config.ts
│   │
│   ├── backend/            # 后端 FastAPI 服务
│   │   ├── app/
│   │   │   ├── api/        # API 路由端点
│   │   │   ├── models/     # 数据库模型 (ORM)
│   │   │   ├── services/   # 业务逻辑服务
│   │   │   ├── ws/         # WebSocket 管理器
│   │   │   ├── core/       # 核心配置
│   │   │   ├── auth/       # JWT 认证
│   │   │   └── main.py     # 应用入口
│   │   ├── alembic/        # 数据库迁移
│   │   └── requirements.txt
│   │
│   ├── engine/             # 对账引擎 (TypeScript，保留)
│   └── shared/             # 共享代码
│
├── docs/                   # 文档
│   ├── prd/               # 产品需求文档
│   ├── tech/              # 技术文档
│   └── ui/                # UI/UX 文档
│
├── design/                # 设计文档
├── docker-compose.yml     # Docker 编排配置
├── Dockerfile            # Docker 镜像构建
└── nginx.conf            # Nginx 配置
```

---

## 构建与运行命令

### 开发环境

```bash
# 前端开发服务器 (端口 5173)
cd packages/renderer && yarn dev

# 后端开发服务器 (端口 8000)
cd packages/backend
source venv/bin/activate  # 激活虚拟环境
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 根目录同时启动前后端
yarn dev
```

### 构建命令

```bash
# 前端构建
cd packages/renderer && yarn build

# 类型检查
cd packages/renderer && yarn typecheck
```

### Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 数据库迁移 (后端)

```bash
cd packages/backend
alembic revision --autogenerate -m "描述"
alembic upgrade head
```

---

## API 端点

| 功能 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 认证登录 | POST | `/api/v1/auth/login` | 用户登录获取 JWT |
| 文件上传 | POST | `/api/v1/files/upload` | 上传配送单/平台账单/流水单 |
| 发起对账 | POST | `/api/v1/reconciliation/execute` | 执行对账任务 |
| WebSocket 进度 | WS | `/api/v1/tasks/ws/{task_id}` | 实时进度推送 |
| 对账汇总 | GET | `/api/v1/reconciliation/summary` | 获取对账汇总 |
| 差异订单 | GET | `/api/v1/reconciliation/discrepancies` | 获取差异订单列表 |
| 商户汇总 | GET | `/api/v1/statistics/flow/merchant-summary-enhanced` | 商户奖励/充值明细 |
| 平台列表 | GET | `/api/v1/platforms` | 获取平台配置列表 |
| 健康检查 | GET | `/api/v1/health` | API 健康状态 |

---

## 核心业务逻辑

### 三方对账引擎

核心对账逻辑位于 `packages/backend/app/services/reconciliation_engine_v2.py`：

**对账规则：**
1. 以商户订单号 (`delivery_order_sn`) 为主键进行关联
2. 同时匹配三方运力订单号 (`third_party_order_id`) 作为辅助
3. 比较三个金额是否一致（配送单金额、流水金额、平台账单金额）
4. 金额容差：0.01 元

**承运商代码映射：**
```python
CARRIER_MAP = {
    "dada": "达达",
    "sf": "顺丰",
    "hh": "蜂鸟",
    "uu": "UU跑腿",
    "ss": "闪送",
    "gxd": "裹小递",
}
```

### 数据模型

**核心 ORM 模型 (`packages/backend/app/models/`)：**
- `DeliveryOrder` - 配送单
- `FlowRecord` - 流水记录
- `PlatformBill` - 平台账单
- `TripartiteReconciliation` - 三方对账结果
- `ReconciliationSummary` - 对账汇总

---

## 开发规范

### 前端规范

1. **组件风格**：函数式组件 + Hooks
2. **样式方案**：Tailwind CSS，使用 class-variance-authority 管理变体
3. **状态管理**：Zustand（轻量级），避免过度使用全局状态
4. **类型定义**：所有 API 响应和组件 Props 必须有 TypeScript 类型
5. **API 调用**：统一使用 `packages/renderer/src/lib/api.ts` 中的 apiClient

### 后端规范

1. **框架风格**：FastAPI 路由 + Pydantic 模型 + SQLAlchemy ORM
2. **配置管理**：使用 `app/core/config.py` 中的 Settings 类，支持 .env 文件
3. **数据库迁移**：使用 Alembic，迁移文件放在 `alembic/versions/`
4. **异步任务**：长时间运行的对账任务使用 Celery + Redis
5. **错误处理**：统一使用 `app/core/responses.py` 中的响应格式

### 代码风格

- **Python**：遵循 PEP 8，使用 4 空格缩进
- **TypeScript**：使用 2 空格缩进，优先使用 `interface` 定义类型
- **命名规范**：
  - Python：snake_case（变量/函数）、PascalCase（类）
  - TypeScript：camelCase（变量/函数）、PascalCase（组件/类型）

---

## 环境配置

### 后端环境变量 (packages/backend/.env)

```env
# 服务配置
HOST=0.0.0.0
PORT=8000
DEBUG=true

# 数据库
DATABASE_URL=sqlite:///./data/ordercomparer.db
# 生产环境: postgresql://user:password@localhost:5432/orderchecker

# JWT
SECRET_KEY=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# Redis (Celery)
REDIS_URL=redis://localhost:6379/0

# CORS
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

### 前端环境变量 (packages/renderer/.env)

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## 默认账号

- 用户名：`admin`
- 密码：`admin123`

---

## 测试

```bash
# 后端 E2E 测试
cd packages/backend
python e2e_test.py

# 本地对账测试
python local_reconciliation_test.py
```

---

## 文档资源

- 产品需求文档：`docs/prd/01-产品需求文档.md`
- 产品需求拆解：`docs/prd/03-产品需求拆解.md`
- 界面设计文档：`design/01-界面设计文档.md`
- UI/UX 交互规范：`docs/ui/02-UI-UX交互规范.md`
- Python 对账逻辑：`docs/python-reconciliation-logic.md`
