# OrderComparer Backend

后台任务服务 - 基于 FastAPI + Celery 的异步任务处理系统

## 技术栈

| 层级 | 技术 |
|------|------|
| Web API | FastAPI |
| 异步任务 | Celery |
| 消息/状态 | Redis |
| 数据库 | PostgreSQL |
| 实时通信 | WebSocket |
| 权限 | JWT + RBAC |
| 部署 | Docker + Docker Compose |

## 快速开始

### 1. 环境准备

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件配置数据库和 Redis 连接
```

### 2. 启动依赖服务

```bash
docker-compose up -d redis db
```

### 3. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 4. 启动 API 服务

```bash
uvicorn app.main:app --reload
```

### 5. 启动 Worker

```bash
celery -A worker.celery_worker worker -l info
```

## Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d

# 启动包含 worker
docker-compose --profile worker up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## API 文档

启动服务后访问: http://localhost:8000/docs

## 项目结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口
│   ├── api/                 # API 路由
│   │   ├── auth.py          # 认证接口
│   │   ├── task.py          # 任务接口
│   │   └── result.py        # 结果接口
│   ├── auth/                # 登录 / RBAC
│   ├── tasks/               # 任务状态机 / 对账逻辑
│   ├── models/              # ORM 模型
│   ├── services/            # 业务服务层
│   ├── ws/                  # WebSocket 逻辑
│   └── utils/
├── worker/
│   └── celery_worker.py     # Celery worker 入口
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 任务状态机

```
INIT -> UPLOADED -> PARSING -> NORMALIZING -> MATCHING -> AGGREGATING -> FINISHED
                                      ↓                              ↓
                                   FAILED                         FAILED
```

## License

MIT
