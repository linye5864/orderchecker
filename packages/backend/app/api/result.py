"""
结果 API 路由
对账结果查询、导出
"""

from typing import Optional, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import io
import csv

from app.core.database import get_db
from app.models.orm_result import ReconciliationResult
from app.models.result import ResultStatus
from app.auth.dependencies import get_current_user, CurrentUser
from app.services.result_service import ResultService

router = APIRouter()


class ResultDetailResponse(BaseModel):
    """结果明细响应"""
    id: str
    order_number: str
    platform_order_number: str
    status: str
    local_amount: float
    platform_amount: float
    amount_diff: float
    local_status: Optional[str]
    platform_status: Optional[str]
    reason: Optional[str]


class ResultSummaryResponse(BaseModel):
    """结果汇总响应"""
    total_orders: int
    matched_orders: int
    exception_orders: int
    missing_orders: int
    match_rate: float
    total_local_amount: float
    total_platform_amount: float
    total_amount_diff: float


class ResultListResponse(BaseModel):
    """结果列表响应"""
    task_id: str
    details: List[ResultDetailResponse]
    summary: Optional[ResultSummaryResponse] = None
    total: int
    page: int
    page_size: int


@router.get("/{task_id}/summary", response_model=ResultSummaryResponse)
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
    
    service = ResultService(db)
    summary = service.get_summary(task_uuid)
    
    if not summary:
        raise HTTPException(status_code=404, detail="任务结果不存在")
    
    return ResultSummaryResponse(**summary)


@router.get("/{task_id}/details", response_model=ResultListResponse)
async def get_task_details(
    task_id: str,
    status: Optional[ResultStatus] = Query(None, description="结果状态"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务对账明细"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    service = ResultService(db)
    details, total = service.get_details(
        task_id=task_uuid,
        status=status.value if status else None,
        page=page,
        page_size=page_size,
    )
    
    summary = service.get_summary(task_uuid)
    
    return ResultListResponse(
        task_id=task_id,
        details=[
            ResultDetailResponse(
                id=str(d.id),
                order_number=d.order_number,
                platform_order_number=d.platform_order_number,
                status=d.status.value,
                local_amount=d.local_amount,
                platform_amount=d.platform_amount,
                amount_diff=d.amount_diff,
                local_status=d.local_status,
                platform_status=d.platform_status,
                reason=d.reason,
            )
            for d in details
        ],
        summary=ResultSummaryResponse(**summary.model_dump()) if summary else None,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}/export/csv")
async def export_results_csv(
    task_id: str,
    status: Optional[ResultStatus] = Query(None, description="结果状态过滤"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导出结果为 CSV 格式"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    service = ResultService(db)
    details, _ = service.get_details(
        task_id=task_id,
        status=status.value if status else None,
        page=1,
        page_size=10000,  # 限制导出数量
    )
    
    # 生成 CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # 写入表头
    writer.writerow([
        "配送单号",
        "平台订单号",
        "状态",
        "配送金额",
        "平台金额",
        "差异",
        "配送状态",
        "平台状态",
        "原因",
    ])
    
    # 写入数据
    for d in details:
        writer.writerow([
            d.order_number,
            d.platform_order_number,
            d.status.value,
            d.local_amount,
            d.platform_amount,
            d.amount_diff,
            d.local_status or "",
            d.platform_status or "",
            d.reason or "",
        ])
    
    # 返回 CSV 文件
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="reconciliation_{task_id}.csv"',
        },
    )


@router.get("/{task_id}/export/json")
async def export_results_json(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导出结果为 JSON 格式"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    service = ResultService(db)
    details, _ = service.get_details(
        task_id=task_id,
        page=1,
        page_size=10000,
    )
    summary = service.get_summary(task_id)
    
    return {
        "task_id": task_id,
        "summary": summary,
        "details": [
            {
                "order_number": d.order_number,
                "platform_order_number": d.platform_order_number,
                "status": d.status.value,
                "local_amount": d.local_amount,
                "platform_amount": d.platform_amount,
                "amount_diff": d.amount_diff,
                "local_status": d.local_status,
                "platform_status": d.platform_status,
                "reason": d.reason,
            }
            for d in details
        ],
    }


@router.get("/{task_id}/statistics")
async def get_task_statistics(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取任务统计信息（按状态分布等）"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    # TODO: 实现统计查询
    return {
        "task_id": task_id,
        "status_distribution": {},
        "platform_distribution": {},
    }
