"""
用户服务
用户 CRUD 操作
"""

import uuid
from datetime import datetime
from typing import Optional, List

import bcrypt
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.user import UserCreate, UserRole
from app.models.orm_user import User


class UserService:
    """用户服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _hash_password(self, password: str) -> str:
        """生成密码哈希"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def _verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """验证密码"""
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    
    def get_by_id(self, user_id: uuid.UUID | str) -> Optional[User]:
        """根据 ID 获取用户"""
        if isinstance(user_id, str):
            try:
                user_id = uuid.UUID(user_id)
            except ValueError:
                return None
        return self.db.query(User).filter(User.id == user_id).first()

    def change_password(self, user_id: uuid.UUID | str, old_password: str, new_password: str) -> bool:
        """修改用户密码"""
        user = self.get_by_id(user_id)
        if not user:
            return False
        
        if not self._verify_password(old_password, user.hashed_password):
            return False
            
        user.hashed_password = self._hash_password(new_password)
        self.db.commit()
        return True
    
    def get_by_username(self, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        return self.db.query(User).filter(User.username == username).first()
    
    def get_by_email(self, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        return self.db.query(User).filter(User.email == email).first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> List[User]:
        """获取用户列表"""
        query = self.db.query(User)
        
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        
        return query.offset(skip).limit(limit).all()
    
    def create(self, user_data: UserCreate) -> User:
        """创建用户"""
        # 检查用户名和邮箱是否已存在
        if self.get_by_username(user_data.username):
            raise ValueError("用户名已存在")
        if self.get_by_email(user_data.email):
            raise ValueError("邮箱已存在")
        
        user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=self._hash_password(user_data.password),
            role=user_data.role or UserRole.VIEWER,
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        return user
    
    def authenticate(self, username: str, password: str) -> Optional[User]:
        """用户认证"""
        user = self.get_by_username(username)
        
        if not user:
            return None
        if not self._verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            return None
        
        return user
    
    def update_role(self, user_id: uuid.UUID, role: UserRole) -> Optional[User]:
        """更新用户角色"""
        user = self.get_by_id(user_id)
        if not user:
            return None
        
        user.role = role
        self.db.commit()
        self.db.refresh(user)
        
        return user
    
    def deactivate(self, user_id: uuid.UUID) -> bool:
        """禁用用户"""
        user = self.get_by_id(user_id)
        if not user:
            return False
        
        user.is_active = False
        self.db.commit()
        
        return True
    
    def activate(self, user_id: uuid.UUID) -> bool:
        """启用用户"""
        user = self.get_by_id(user_id)
        if not user:
            return False
        
        user.is_active = True
        self.db.commit()
        
        return True
    
    def count(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> int:
        """统计用户数量"""
        query = self.db.query(User)
        
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        
        return query.count()
