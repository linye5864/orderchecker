"""
文件 API 路由
文件上传、管理
"""

from typing import Optional, Literal, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import success, success_with_pagination
from app.models.orm_file import UploadedFile
from app.auth.dependencies import get_current_user, CurrentUser
from app.services.file_service import FileProcessingService


# 文件类型
FileTypeLiteral = Literal["delivery", "platform", "flow"]

router = APIRouter()


class FileUploadResponse(BaseModel):
    """文件上传响应"""
    id: str
    filename: str
    size: str
    file_type: str
    created_at: str


class FileInfoResponse(BaseModel):
    """文件信息响应"""
    id: str
    filename: str
    size: str
    file_type: str
    is_processed: bool
    created_at: str


class FileListResponse(BaseModel):
    """文件列表响应"""
    files: list
    total: int


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Query("delivery", description="文件类型 (delivery, platform, flow)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传文件"""
    # 读取文件内容
    content = await file.read()
    
    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空")
    
    # 检查文件大小
    if len(content) > 100 * 1024 * 1024:  # 100MB
        raise HTTPException(status_code=400, detail="文件大小超过限制 (100MB)")
    
    # 保存文件
    service = FileProcessingService(db)
    uploaded_file = await service.save_uploaded_file(
        file_content=content,
        original_filename=file.filename or "unknown",
        file_type=file_type,
        user_id=current_user.id,
    )
    
    response_data = {
        "id": str(uploaded_file.id),
        "filename": uploaded_file.original_filename or "",
        "size": uploaded_file.size_formatted,
        "file_size_bytes": uploaded_file.file_size,
        "file_type": str(uploaded_file.file_type),
        "created_at": uploaded_file.created_at.isoformat(),
        "success": True,
    }
    
    return success(response_data)


@router.get("")
async def list_files(
    file_type: Optional[str] = Query(None, description="文件类型过滤 (delivery, platform, flow)"),
    is_processed: Optional[bool] = Query(None, description="是否已处理"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取文件列表"""
    service = FileProcessingService(db)
    files, total = service.list_files(
        user_id=current_user.id,
        file_type=file_type,
        is_processed=is_processed,
        skip=(page - 1) * page_size,
        limit=page_size
    )
    
    file_list = [
        {
            "id": str(f.id),
            "filename": f.original_filename,
            "size": f.size_formatted,
            "file_type": str(f.file_type),
            "is_processed": bool(f.is_processed),
            "created_at": f.created_at.isoformat(),
        }
        for f in files
    ]
    
    return success_with_pagination(file_list, page, page_size, total)


@router.get("/{file_id}", response_model=FileInfoResponse)
async def get_file(
    file_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取文件信息"""
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        return error("无效的文件ID", code=400)
    
    service = FileProcessingService(db)
    file_record = service.get_file_by_id(file_uuid)
    
    if not file_record or (file_record.uploaded_by and str(file_record.uploaded_by) != current_user.id):
        return error("文件不存在", code=404)
    
    file_data = {
        "id": str(file_record.id),
        "filename": file_record.original_filename,
        "size": file_record.size_formatted,
        "file_type": str(file_record.file_type),
        "is_processed": bool(file_record.is_processed),
        "created_at": file_record.created_at.isoformat(),
    }
    
    return success(file_data)


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载文件"""
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        return error("无效的文件ID", code=400)
    
    service = FileProcessingService(db)
    file_record = service.get_file_by_id(file_uuid)
    
    if not file_record or (file_record.uploaded_by and str(file_record.uploaded_by) != current_user.id):
        return error("文件不存在", code=404)
    
    return FileResponse(
        path=file_record.file_path,
        filename=file_record.original_filename,
        media_type=file_record.mime_type,
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除文件"""
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        return error("无效的文件ID", code=400)
    
    service = FileProcessingService(db)
    file_record = service.get_file_by_id(file_uuid)
    if not file_record or (file_record.uploaded_by and str(file_record.uploaded_by) != current_user.id):
        return error("文件不存在或无权删除", code=404)
        
    success_del = service.delete_file(file_uuid)
    if not success_del:
        return error("删除失败", code=500)
    
    return success({"message": "文件已删除", "file_id": file_id})


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""
    ids: List[str]


@router.delete("")
async def delete_files(
    request: BatchDeleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """批量删除文件"""
    service = FileProcessingService(db)
    deleted_count = 0
    errors = []
    
    for file_id in request.ids:
        try:
            file_uuid = uuid.UUID(file_id)
            file_record = service.get_file_by_id(file_uuid)
            if file_record and (not file_record.uploaded_by or str(file_record.uploaded_by) == current_user.id):
                if service.delete_file(file_uuid):
                    deleted_count += 1
                else:
                    errors.append(f"文件 {file_id} 删除失败")
            else:
                errors.append(f"文件 {file_id} 不存在或无权删除")
        except ValueError:
            errors.append(f"无效的 ID: {file_id}")
            
    return success({
        "deleted_count": deleted_count,
        "errors": errors
    })


@router.post("/{file_id}/detect-type")
async def detect_file_type(
    file_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """检测文件类型"""
    try:
        file_uuid = uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的文件ID")
    
    service = FileProcessingService(db)
    file_record = service.get_file_by_id(file_uuid)
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    detected_type = service.detect_file_type(file_record.file_path)
    
    result = {
        "file_id": file_id,
        "detected_type": detected_type if detected_type else None,
    }
    
    return success(result)
