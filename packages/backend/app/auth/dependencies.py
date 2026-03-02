"""
认证依赖注入
提供 FastAPI 依赖项用于权限验证
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.orm_user import User
from app.auth.jwt_utils import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class CurrentUser:
    """当前用户"""
    
    def __init__(self, id: str, username: str, role: str):
        self.id = id
        self.username = username
        self.role = role


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """获取当前登录用户"""
    payload = decode_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    username = payload.get("sub")
    user_id = payload.get("user_id", "")
    role = payload.get("role", "viewer")
    
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return CurrentUser(
        id=user_id,
        username=username,
        role=role,
    )


def require_roles(*allowed_roles: str):
    """角色权限检查依赖工厂"""
    
    async def role_checker(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足，需要以下角色: " + ", ".join(allowed_roles),
            )
        return user
    
    return role_checker


# 快捷依赖
require_admin = require_roles("admin")
require_operator = require_roles("admin", "operator")
