"""
任务 API 路由
任务 CRUD、状态管理、WebSocket 进度订阅
"""

from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.tasks.state_machine import TaskStatus
from app.models.orm_task import Task
from app.models.orm_file import FileType
from app.auth.dependencies import get_current_user, CurrentUser
from app.services.task_crud_service import TaskCRUDService
from app.services.file_service import FileProcessingService
from app.tasks.executor import TaskExecutionService
from app.tasks.state_machine import TaskStateMachine, TransitionError
from app.ws.manager import ws_manager

router = APIRouter()


class TaskCreateRequest(BaseModel):
    """任务创建请求"""
    name: str = Field(..., min_length=1, max_length=200, description="任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="任务描述")
    file_ids: List[str] = Field(default_factory=list, description="文件ID列表")


class TaskUpdateRequest(BaseModel):
    """任务更新请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)


class TaskResponse(BaseModel):
    """任务响应"""
    id: str
    name: str
    description: Optional[str]
    status: str
    progress: float
    message: str
    error_message: Optional[str]
    summary: Optional[dict]
    created_at: datetime
    updated_at: Optional[datetime]
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """任务列表响应"""
    tasks: List[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskSummaryResponse(BaseModel):
    """任务汇总统计响应"""
    task_id: str
    summary: dict


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status: Optional[str] = Query(None, description="任务状态过滤"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务列表"""
    # 转换状态字符串为枚举
    status_enum = None
    if status:
        try:
            status_enum = TaskStatus(status)
        except ValueError:
            pass

    service = TaskCRUDService(db)
    tasks, total = service.list_tasks(
        user_id=current_user.id,
        status=status_enum,
        skip=(page - 1) * page_size,
        limit=page_size,
    )
    
    return TaskListResponse(
        tasks=[
            TaskResponse(
                id=str(t.id),
                name=t.name,
                description=t.description,
                status=t.status if isinstance(t.status, str) else t.status.value,
                progress=t.progress,
                message=t.message,
                error_message=t.error_message,
                summary=t.summary,
                created_at=t.created_at,
                updated_at=t.updated_at,
                finished_at=t.finished_at,
            )
            for t in tasks
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务详情"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    service = TaskCRUDService(db)
    task = service.get_by_id(task_uuid)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return TaskResponse(
        id=str(task.id),
        name=task.name,
        description=task.description,
        status=task.status if isinstance(task.status, str) else task.status.value,
        progress=task.progress,
        message=task.message,
        error_message=task.error_message,
        summary=task.summary,
        created_at=task.created_at,
        updated_at=task.updated_at,
        finished_at=task.finished_at,
    )


@router.post("", response_model=TaskResponse)
async def create_task(
    request: TaskCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建新任务"""
    # 创建任务
    crud_service = TaskCRUDService(db)
    task = crud_service.create(
        name=request.name,
        description=request.description,
        file_ids=request.file_ids,
        user_id=current_user.id,
    )
    
    return TaskResponse(
        id=str(task.id),
        name=task.name,
        description=task.description,
        status=task.status if isinstance(task.status, str) else task.status.value,
        progress=task.progress,
        message=task.message,
        error_message=task.error_message,
        summary=task.summary,
        created_at=task.created_at,
        updated_at=task.updated_at,
        finished_at=task.finished_at,
    )


@router.post("/{task_id}/start")
async def start_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """启动任务执行"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    crud_service = TaskCRUDService(db)
    task = crud_service.get_by_id(task_uuid)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 验证状态
    current_status = task.status if isinstance(task.status, str) else task.status.value
    if current_status != TaskStatus.INIT.value:
        raise HTTPException(
            status_code=400,
            detail=f"任务状态不正确，当前状态: {current_status}"
        )
    
    # 执行任务
    executor_service = TaskExecutionService(db)
    executor_service.run_reconciliation(task_uuid, task.file_ids or [])
    
    return {
        "message": "任务已启动",
        "task_id": task_id,
        "status": "PROCESSING",
    }


@router.delete("/{task_id}")
async def cancel_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取消任务"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    crud_service = TaskCRUDService(db)
    success = crud_service.cancel(task_uuid)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail="任务无法取消（可能已完成或不存在）"
        )
    
    return {"message": "任务已取消", "task_id": task_id}


@router.get("/{task_id}/summary")
async def get_task_summary(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务汇总统计"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    crud_service = TaskCRUDService(db)
    task = crud_service.get_by_id(task_uuid)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return TaskSummaryResponse(
        task_id=task_id,
        summary=task.summary or {},
    )


@router.websocket("/ws/{task_id}")
async def task_progress_websocket(
    websocket: WebSocket,
    task_id: str,
):
    """
    任务进度 WebSocket 订阅
    
    连接后会自动订阅该任务的进度更新
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        await websocket.close(code=4000, reason="Invalid task ID")
        return
    
    await ws_manager.connect(websocket, task_id)
    
    try:
        # 保持连接，处理消息
        while True:
            data = await websocket.receive_text()
            # 可以处理心跳等消息
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket)


@router.get("/{task_id}/results")
async def get_task_results(
    task_id: str,
    status: Optional[str] = Query(None, description="结果状态过滤 (MATCHED, EXCEPTION, MISSING)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务对账结果明细"""
    from app.services.result_service import ResultService
    from app.models.result import ResultStatus

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")

    result_service = ResultService(db)
    result_status = None

    if status:
        try:
            result_status = ResultStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"无效的结果状态: {status}")

    details, total = result_service.get_details(
        task_id=task_id,
        status=result_status.value if result_status else None,
        page=page,
        page_size=page_size,
    )

    return {
        "task_id": task_id,
        "results": details,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
