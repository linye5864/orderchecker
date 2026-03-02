"""
Alembic 环境配置
"""

from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy import create_engine

from alembic import context

# 导入应用配置
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.database import Base

# 导入所有 ORM 模型
from app.models.orm_user import User
from app.models.orm_task import Task
from app.models.orm_result import ReconciliationResult
from app.models.orm_file import UploadedFile

# 新增三方对账模型
from app.models.orm_delivery import DeliveryOrder, DeliverySummary
from app.models.orm_flow import FlowRecord, MerchantSummary
from app.models.orm_platform import PlatformBill, PlatformSummary
from app.models.orm_reconciliation import (
    TripartiteReconciliation,
    ReconciliationSummary,
    ReconciliationStatus,
    DiscrepancyType,
)

# 获取目标元数据
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线运行迁移（不连接数据库）"""
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线运行迁移（连接数据库）"""
    # 创建引擎
    engine = create_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
        echo=False,
    )
    
    connection = engine.connect()
    
    try:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=True,
        )
        
        with context.begin_transaction():
            context.run_migrations()
    finally:
        connection.close()


# 默认离线模式，避免自动连接数据库
if context.is_offline_mode():
    run_migrations_offline()
else:
    # 使用离线模式生成迁移
    print("使用离线模式生成迁移...")
    run_migrations_offline()
