"""
认证 API 路由
登录、注册、Token 管理
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import success, error
from app.models.user import UserRole
from app.models.orm_user import User
from app.services.auth_service import AuthService
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter()


class LoginRequest(BaseModel):
    """登录请求"""
    username: str
    password: str


class LoginResponse(BaseModel):
    """登录响应"""
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegisterRequest(BaseModel):
    """注册请求"""
    username: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.VIEWER


class TokenRefreshRequest(BaseModel):
    """Token 刷新请求"""
    token: str


class UserResponse(BaseModel):
    """用户响应"""
    id: str
    username: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.post("/login")
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    """用户登录"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"收到登录请求: {request.username}")
    
    auth_service = AuthService(db)
    try:
        result = auth_service.login(request.username, request.password)
    except Exception as e:
        logger.error(f"登录过程发生异常: {str(e)}", exc_info=True)
        raise
    
    if not result:
        logger.warning(f"登录失败: 用户名或密码错误 - {request.username}")
        return error("用户名或密码错误", code=status.HTTP_401_UNAUTHORIZED)
    
    logger.info(f"用户登录成功: {request.username}")
    return success(result)


@router.post("/register")
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    """用户注册"""
    from app.models.user import UserCreate
    
    auth_service = AuthService(db)
    
    try:
        user_data = UserCreate(
            username=request.username,
            email=request.email,
            password=request.password,
            role=request.role,
        )
        result = auth_service.register(user_data)
        return success(result)
    except ValueError as e:
        return error(str(e), code=status.HTTP_400_BAD_REQUEST)


@router.post("/token/refresh")
async def refresh_token(
    request: TokenRefreshRequest,
    db: Session = Depends(get_db),
):
    """刷新 Token"""
    auth_service = AuthService(db)
    new_token = auth_service.refresh_token(request.token)
    
    if not new_token:
        return error("无效的 Token", code=status.HTTP_401_UNAUTHORIZED)
    
    return success({
        "access_token": new_token,
        "token_type": "bearer"
    })


@router.get("/me")
async def get_current_user_info(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户信息"""
    user_service = AuthService(db).user_service
    user = user_service.get_by_id(current_user.id)
    
    if not user:
        return error("用户不存在", code=status.HTTP_404_NOT_FOUND)
    
    user_data = {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
        "is_active": user.is_active,
    }
    
    return success(user_data)


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """修改当前用户密码"""
    user_service = AuthService(db).user_service
    success_change = user_service.change_password(
        user_id=current_user.id,
        old_password=request.old_password,
        new_password=request.new_password
    )
    
    if not success_change:
        return error("原始密码错误或修改失败", code=status.HTTP_400_BAD_REQUEST)
    
    return success(message="密码修改成功")


@router.post("/logout")
async def logout(current_user: CurrentUser = Depends(get_current_user)):
    """用户登出"""
    # 如果需要，这里可以将会话标记为过期或加入黑名单
    return success(message="已成功登出")
