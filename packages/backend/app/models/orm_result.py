"""
对账结果模型 - SQLAlchemy ORM
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.result import ResultStatus


class ReconciliationResult(Base):
    """对账结果明细表 - 存储每条订单的对账结果"""
    __tablename__ = "reconciliation_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # 任务关联
    task_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # 订单信息
    order_number = Column(String(100), nullable=False, index=True)  # 配送单号
    platform_order_number = Column(String(100), nullable=True, index=True)  # 平台订单号
    
    # 对账状态
    status = Column(
        String(50),
        nullable=False,
        index=True,
    )
    
    # 金额信息 (单位: 元)
    local_amount = Column(Float, default=0.0, nullable=False)
    platform_amount = Column(Float, default=0.0, nullable=False)
    amount_diff = Column(Float, default=0.0, nullable=False)
    
    # 状态信息
    local_status = Column(String(50), nullable=True)  # 配送状态
    platform_status = Column(String(50), nullable=True)  # 平台订单状态
    
    # 异常原因
    reason = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 索引
    __table_args__ = (
        Index("idx_task_status", "task_id", "status"),
        Index("idx_order_number", "order_number"),
    )
    
    def __repr__(self):
        return f"<ReconciliationResult(id={self.id}, order={self.order_number}, status={self.status})>"
    
    @property
    def is_matched(self) -> bool:
        """是否匹配成功"""
        return self.status == ResultStatus.MATCHED.value
    
    @property
    def is_exception(self) -> bool:
        """是否金额异常"""
        return self.status == ResultStatus.EXCEPTION.value
    
    @property
    def is_missing(self) -> bool:
        """是否订单缺失"""
        return self.status == ResultStatus.MISSING.value
