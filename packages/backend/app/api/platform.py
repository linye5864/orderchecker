"""
平台配置 API 路由
"""

from typing import List, Dict, Any, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.responses import success, error
from app.models.orm_platform_config import PlatformConfig
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter()


class FieldMapping(BaseModel):
    localField: str
    platformField: str
    required: bool = False


class PlatformUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    tolerance: Optional[float] = None
    fieldMappings: Optional[List[FieldMapping]] = None
    autoSync: Optional[bool] = None
    syncInterval: Optional[int] = None


@router.get("")
async def list_platforms(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """获取所有平台配置"""
    platforms = db.query(PlatformConfig).all()
    
    # 如果数据库为空，可以返回一些默认值或空列表
    return success([
        {
            "id": str(p.id),
            "platformId": p.platform_id,
            "name": p.name,
            "enabled": p.enabled,
            "tolerance": p.tolerance,
            "fieldMappings": p.field_mappings,
            "autoSync": p.auto_sync,
            "syncInterval": p.sync_interval,
            "createdAt": p.created_at.isoformat(),
        }
        for p in platforms
    ])


@router.get("/{platform_id}")
async def get_platform(
    platform_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """获取单个平台详情"""
    try:
        # 尝试作为 UUID 查找
        p_uuid = uuid.UUID(platform_id)
        platform = db.query(PlatformConfig).filter(PlatformConfig.id == p_uuid).first()
    except ValueError:
        # 尝试作为 platform_id 查找 (如 "dada")
        platform = db.query(PlatformConfig).filter(PlatformConfig.platform_id == platform_id).first()
        
    if not platform:
        return error("平台不存在", code=404)
        
    return success({
        "id": str(platform.id),
        "platformId": platform.platform_id,
        "name": platform.name,
        "enabled": platform.enabled,
        "tolerance": platform.tolerance,
        "fieldMappings": platform.field_mappings,
        "autoSync": platform.auto_sync,
        "syncInterval": platform.sync_interval,
        "createdAt": platform.created_at.isoformat(),
    })


@router.put("/{platform_id}")
async def update_platform(
    platform_id: str,
    update_data: PlatformUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """更新平台配置"""
    try:
        p_uuid = uuid.UUID(platform_id)
        platform = db.query(PlatformConfig).filter(PlatformConfig.id == p_uuid).first()
    except ValueError:
        platform = db.query(PlatformConfig).filter(PlatformConfig.platform_id == platform_id).first()
        
    if not platform:
        return error("平台不存在", code=404)
        
    if update_data.name is not None: platform.name = update_data.name
    if update_data.enabled is not None: platform.enabled = update_data.enabled
    if update_data.tolerance is not None: platform.tolerance = update_data.tolerance
    if update_data.fieldMappings is not None: 
        platform.field_mappings = [m.dict() for m in update_data.fieldMappings]
    if update_data.autoSync is not None: platform.auto_sync = update_data.autoSync
    if update_data.syncInterval is not None: platform.sync_interval = update_data.syncInterval
    
    db.commit()
    db.refresh(platform)
    
    return success({
        "id": str(platform.id),
        "platformId": platform.platform_id,
        "name": platform.name,
        "enabled": platform.enabled,
        "tolerance": platform.tolerance,
        "fieldMappings": platform.field_mappings,
    })
