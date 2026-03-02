"""
OrderComparer 后台任务服务
基于 FastAPI + Celery 的异步任务处理系统
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings
from app.api import auth, task, result, file, statistics, reconciliation, platform
from app.ws.manager import ws_manager

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("🚀 应用启动中...")
    logger.info("✅ WebSocket 管理器已就绪")
    
    yield

    # 关闭时
    logger.info("👋 应用关闭中...")
    logger.info("✅ WebSocket 管理器已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="OrderComparer 后台任务服务",
    description="后台任务状态机服务 - Excel 对账等长时间异步任务处理",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/v1/auth", tags=["认证"])
app.include_router(file.router, prefix="/api/v1/files", tags=["文件"])
app.include_router(task.router, prefix="/api/v1/tasks", tags=["任务"])
app.include_router(result.router, prefix="/api/v1/results", tags=["结果"])
app.include_router(statistics.router, prefix="/api/v1/statistics", tags=["统计"])
app.include_router(reconciliation.router, prefix="/api/v1/reconciliation", tags=["对账兼容"])
app.include_router(platform.router, prefix="/api/v1/platforms", tags=["平台"])


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "OrderComparer 后台任务服务",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/api/v1/health")
async def api_health():
    """API 健康检查"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "api": "running",
            "database": "connected",  # TODO: 检查数据库连接
            "redis": "connected",  # TODO: 检查 Redis 连接
        }
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理"""
    logger.error(f"未捕获的异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "code": 500,
            "message": "服务器内部错误",
            "error": str(exc) if settings.DEBUG else "请查看服务器日志",
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
