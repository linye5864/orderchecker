"""
应用配置管理
基于 Pydantic Settings，支持 .env 文件
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置"""

    # 应用基本信息
    APP_NAME: str = "OrderComparer 后台任务服务"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # 服务配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 数据库配置 (支持 PostgreSQL 和 SQLite)
    # 开发环境使用 SQLite，生产环境使用 PostgreSQL
    DATABASE_URL: str = "sqlite:///./data/ordercomparer.db"
    USE_SQLITE: bool = True
    SQLITE_PATH: str = "./data/ordercomparer.db"

    # Redis 配置
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT 配置
    SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24  # 24小时

    # Celery 配置
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_URL: str = "redis://redis:6379/0"

    # 文件存储配置
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB

    # CORS 配置
    CORS_ORIGINS: list = [
        "http://localhost:3000", 
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
