"""
任务模型定义
"""

from enum import Enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """任务状态"""
    INIT = "INIT"             # 初始化
    UPLOADED = "UPLOADED"     # 文件上传完成
    PARSING = "PARSING"       # Excel 解析中
    NORMALIZING = "NORMALIZING"  # 数据标准化
    MATCHING = "MATCHING"     # 对账匹配
    AGGREGATING = "AGGREGATING"  # 汇总统计
    FINISHED = "FINISHED"     # 成功完成
    FAILED = "FAILED"         # 失败


class TaskBase(BaseModel):
    """任务基础模型"""
    name: str
    description: Optional[str] = None


class TaskCreate(TaskBase):
    """任务创建"""
    file_ids: list[str] = Field(default_factory=list)


class Task(TaskBase):
    """任务模型"""
    id: str
    status: TaskStatus
    progress: float = 0.0
    message: str = ""
    error_message: Optional[str] = None
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    """任务更新"""
    status: Optional[TaskStatus] = None
    progress: Optional[float] = None
    message: Optional[str] = None
    error_message: Optional[str] = None
