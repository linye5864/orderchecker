"""
认证服务
登录、注册、Token 管理
"""

from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import UserCreate, UserRole
from app.models.orm_user import User
from app.services.user_service import UserService
from app.auth.jwt_utils import create_access_token, decode_token


class AuthService:
    """认证服务"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)
    
    def login(self, username: str, password: str) -> Optional[dict]:
        """用户登录"""
        user = self.user_service.authenticate(username, password)

        if not user:
            return None

        # 获取角色值（可能是字符串或枚举）
        role_value = user.role.value if hasattr(user.role, 'value') else str(user.role)

        # 生成 token
        access_token = create_access_token(
            data={
                "sub": user.username,
                "user_id": str(user.id),
                "role": role_value,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": role_value,
            }
        }

    def register(self, user_data: UserCreate) -> dict:
        """用户注册"""
        # 检查是否启用注册
        # TODO: 可以从配置中读取是否允许注册

        user = self.user_service.create(user_data)

        # 获取角色值（可能是字符串或枚举）
        role_value = user.role.value if hasattr(user.role, 'value') else str(user.role)

        # 生成 token
        access_token = create_access_token(
            data={
                "sub": user.username,
                "user_id": str(user.id),
                "role": role_value,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": role_value,
            }
        }
    
    def get_current_user_from_token(self, token: str) -> Optional[User]:
        """从 Token 获取当前用户"""
        payload = decode_token(token)
        
        if not payload:
            return None
        
        username = payload.get("sub")
        if not username:
            return None
        
        return self.user_service.get_by_username(username)
    
    def verify_token(self, token: str) -> bool:
        """验证 Token 是否有效"""
        payload = decode_token(token)
        return payload is not None
    
    def refresh_token(self, token: str) -> Optional[str]:
        """刷新 Token"""
        payload = decode_token(token)
        
        if not payload:
            return None
        
        # 检查 token 是否过期超过允许时间
        # 如果即将过期，生成新的 token
        exp = payload.get("exp")
        if exp:
            from datetime import datetime
            exp_datetime = datetime.fromtimestamp(exp)
            # 如果还有 30 分钟以上过期，不需要刷新
            if (exp_datetime - datetime.utcnow()).total_seconds() > 1800:
                return token
        
        # 生成新 token
        access_token = create_access_token(
            data={
                "sub": payload.get("sub"),
                "user_id": payload.get("user_id"),
                "role": payload.get("role"),
            }
        )
        
        return access_token
