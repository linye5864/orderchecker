"""
任务模型 - SQLAlchemy ORM
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON
from app.core.database import Base
from app.models.task import TaskStatus
from app.core.guid import GUID


class Task(Base):
    """任务表 - 存储对账任务信息"""
    __tablename__ = "tasks"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # 状态机字段
    status = Column(
        String(50),
        default=TaskStatus.INIT.value,
        nullable=False,
        index=True,
    )
    progress = Column(Float, default=0.0, nullable=False)
    message = Column(String(500), default="", nullable=False)
    error_message = Column(Text, nullable=True)
    
    # 结果汇总 (JSON)
    summary = Column(JSON, nullable=True)
    
    # 关联文件
    file_ids = Column(JSON, nullable=True)  # 存储文件ID列表
    
    # 用户关联
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<Task(id={self.id}, name={self.name}, status={self.status})>"
    
    @property
    def is_final(self) -> bool:
        """是否为终态"""
        return self.status in [TaskStatus.FINISHED.value, TaskStatus.FAILED.value]
    
    @property
    def match_rate(self) -> float:
        """获取匹配率"""
        if self.summary:
            total = self.summary.get("total_orders", 0)
            matched = self.summary.get("matched_orders", 0)
            if total > 0:
                return round(matched / total * 100, 2)
        return 0.0
