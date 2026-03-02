"""
用户模型定义
"""

from enum import Enum
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserRole(str, Enum):
    """用户角色"""
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class UserBase(BaseModel):
    """用户基础模型"""
    username: str
    email: EmailStr


class UserCreate(UserBase):
    """用户创建"""
    password: str
    role: UserRole = UserRole.VIEWER


class UserInDB(UserBase):
    """数据库中的用户"""
    id: str
    hashed_password: str
    role: UserRole
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserResponse(UserBase):
    """用户响应"""
    id: str
    role: UserRole
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
