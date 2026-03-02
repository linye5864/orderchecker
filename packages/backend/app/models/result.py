"""
对账结果模型定义
"""

from enum import Enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ResultStatus(str, Enum):
    """对账结果状态"""
    MATCHED = "MATCHED"       # 匹配成功
    EXCEPTION = "EXCEPTION"   # 金额异常
    MISSING = "MISSING"       # 订单缺失


class ResultDetailBase(BaseModel):
    """结果明细基础"""
    order_number: str
    platform_order_number: str
    status: ResultStatus
    local_amount: float
    platform_amount: float
    amount_diff: float
    local_status: Optional[str] = None
    platform_status: Optional[str] = None
    reason: Optional[str] = None


class ResultDetailInDB(ResultDetailBase):
    """数据库中的结果明细"""
    id: str
    task_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class ResultSummary(BaseModel):
    """汇总统计"""
    total_orders: int
    matched_orders: int
    exception_orders: int
    missing_orders: int
    match_rate: float
    total_local_amount: float
    total_platform_amount: float
    total_amount_diff: float
