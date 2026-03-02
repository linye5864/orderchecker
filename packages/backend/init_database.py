#!/usr/bin/env python
"""
数据库初始化脚本
创建所有三方对账相关的表
"""

import os
import sys

# 添加 backend 到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from app.core.database import Base
from app.models.orm_delivery import DeliveryOrder, DeliverySummary
from app.models.orm_flow import FlowRecord, MerchantSummary
from app.models.orm_platform import PlatformBill, PlatformSummary
from app.models.orm_reconciliation import (
    TripartiteReconciliation,
    ReconciliationSummary,
    ReconciliationStatus,
    DiscrepancyType,
)


def init_database():
    """初始化数据库"""
    # 数据库路径
    db_path = os.path.join(os.path.dirname(__file__), "data", "ordercomparer.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    DATABASE_URL = f"sqlite:///{db_path}"
    
    # 创建引擎
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False}
    )
    
    # 创建所有表
    print("创建数据库表...")
    
    # 导入所有模型以确保它们被注册
    from app.models.orm_user import User
    from app.models.orm_task import Task
    from app.models.orm_result import ReconciliationResult
    from app.models.orm_file import UploadedFile
    
    # 创建表
    Base.metadata.create_all(engine)
    
    print("数据库表创建完成!")
    
    # 验证表是否存在
    with engine.connect() as conn:
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in result.fetchall()]
        print(f"\n已创建的表:")
        for table in sorted(tables):
            print(f"  - {table}")
    
    return engine


def verify_models():
    """验证所有模型"""
    print("\n验证模型...")
    
    models = [
        ("DeliveryOrder", DeliveryOrder),
        ("DeliverySummary", DeliverySummary),
        ("FlowRecord", FlowRecord),
        ("MerchantSummary", MerchantSummary),
        ("PlatformBill", PlatformBill),
        ("PlatformSummary", PlatformSummary),
        ("TripartiteReconciliation", TripartiteReconciliation),
        ("ReconciliationSummary", ReconciliationSummary),
    ]
    
    for name, model in models:
        print(f"  {name}: {model.__tablename__}")
    
    print("\n所有模型验证通过!")


def seed_data(engine):
    """预置初始数据"""
    from sqlalchemy.orm import sessionmaker
    from app.models.orm_platform_config import PlatformConfig
    from app.models.orm_user import User
    from app.models.user import UserRole
    import bcrypt

    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # 1. 创建默认管理员 (password: admin123)
        if not session.query(User).filter(User.username == "admin").first():
            print("正在创建默认管理员...")
            salt = bcrypt.gensalt()
            hashed_pw = bcrypt.hashpw("admin123".encode('utf-8'), salt).decode('utf-8')
            admin = User(
                username="admin",
                email="admin@example.com",
                hashed_password=hashed_pw,
                role=UserRole.ADMIN,
            )
            session.add(admin)

        # 2. 创建预置平台配置
        platforms = [
            {"id": "dada", "name": "达达", "icon": "🚴"},
            {"id": "shansong", "name": "闪送", "icon": "📦"},
            {"id": "fengniao", "name": "蜂鸟", "icon": "🐦"},
            {"id": "sf", "name": "顺丰同城", "icon": "✈️"},
            {"id": "sf_enterprise", "name": "顺丰企业C", "icon": "🏢"},
            {"id": "uu", "name": "UU跑腿", "icon": "🏃"},
            {"id": "guoxiaodi", "name": "裹小递", "icon": "📱"},
        ]

        for p_data in platforms:
            if not session.query(PlatformConfig).filter(PlatformConfig.platform_id == p_data["id"]).first():
                print(f"正在预置平台: {p_data['name']}...")
                p = PlatformConfig(
                    platform_id=p_data["id"],
                    name=p_data["name"],
                    icon=p_data["icon"],
                    enabled=True,
                    tolerance=0.01,
                    field_mappings=[]
                )
                session.add(p)

        session.commit()
        print("初始数据预置完成!")
    except Exception as e:
        print(f"预置数据失败: {e}")
        session.rollback()
    finally:
        session.close()


if __name__ == "__main__":
    print("=" * 60)
    print("OrderComparer 数据库初始化")
    print("=" * 60)
    
    engine = init_database()
    verify_models()
    seed_data(engine)
    
    print("\n" + "=" * 60)
    print("初始化完成!")
    print("=" * 60)
