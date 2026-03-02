"""
平台配置模型 - SQLAlchemy ORM
用于存储不同配送平台的字段映射、容差、自动同步等配置
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, JSON, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class PlatformConfig(Base):
    """平台配置 - 存储各平台的对账参数和字段映射"""
    __tablename__ = "platform_configs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform_id = Column(String(64), unique=True, nullable=False, index=True) # 如 dada, shansong, sf
    name = Column(String(128), nullable=False)                               # 平台名称
    icon = Column(String(500), nullable=True)                                # 图标路径或 URL
    
    # 对账核心配置
    enabled = Column(Boolean, default=True)                                  # 是否启用
    tolerance = Column(Float, default=0.01)                                  # 金额容差
    
    # 字段映射 (JSON 存储列表或字典)
    # 格式: [{"localField": "order_sn", "platformField": "第三方订单号", "required": true}]
    field_mappings = Column(JSON, nullable=True)
    
    # 同步配置
    auto_sync = Column(Boolean, default=False)
    sync_interval = Column(Integer, default=15)                              # 分钟
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PlatformConfig(platform_id={self.platform_id}, name={self.name})>"
