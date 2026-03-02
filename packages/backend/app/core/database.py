"""
数据库连接管理
支持 PostgreSQL 和 SQLite
"""

import os
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session, declarative_base

from app.core.config import settings

# 创建数据库 URL
if settings.USE_SQLITE:
    # SQLite 模式 (本地开发)
    DATABASE_URL = f"sqlite:///{settings.SQLITE_PATH}"
    # 确保目录存在
    os.makedirs(os.path.dirname(settings.SQLITE_PATH), exist_ok=True)
else:
    # PostgreSQL 模式 (Docker/生产)
    DATABASE_URL = settings.DATABASE_URL

# 创建引擎
if settings.USE_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=settings.DEBUG,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        echo=settings.DEBUG,
    )

# 会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# 声明基类
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话（FastAPI 依赖）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """获取数据库会话（上下文管理器，用于 Celery）"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """初始化数据库（创建所有表）"""
    # 导入所有模型以确保它们被注册
    from app.models import User, Task, UploadedFile, ReconciliationResult
    
    Base.metadata.create_all(bind=engine)


def drop_db():
    """删除所有表（慎用）"""
    Base.metadata.drop_all(bind=engine)
