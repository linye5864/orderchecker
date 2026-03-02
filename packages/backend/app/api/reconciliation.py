"""
Reconciliation API Router - 为前端 renderer 提供兼容的 API
将 TripartiteReconciliationEngine 的结果转换为 renderer 期望的格式
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import success, success_with_pagination
from app.models.orm_task import Task, TaskStatus
from app.models.orm_reconciliation import TripartiteReconciliation, ReconciliationSummary
from app.services.reconciliation_engine_v2 import TripartiteReconciliationEngine
from app.auth.dependencies import get_current_user, CurrentUser

router = APIRouter(tags=["对账兼容API"])


# ==================== 响应格式转换 ====================

def convert_summary_to_renderer_format(summary: Dict[str, Any]) -> Dict[str, Any]:
    """将后端汇总转换为 renderer 期望的格式"""
    return {
        "totalOrders": summary.get("total_orders", 0),
        "matchedOrders": summary.get("matched_orders", 0),
        "matchRate": summary.get("match_rate", 0),
        "discrepancyRate": summary.get("discrepancy_rate", 0),
        "totalLocalAmount": summary.get("total_delivery_amount", 0),
        "totalPlatformAmount": summary.get("total_platform_amount", 0),
        "totalFundAmount": summary.get("total_flow_amount", 0),
        "amountDiff": summary.get("total_diff_delivery_vs_flow", 0),
    }


def convert_detail_to_renderer_format(detail: TripartiteReconciliation) -> Dict[str, Any]:
    """将明细转换为 renderer 期望的格式"""
    return {
        "id": str(detail.id),
        "orderNumber": detail.delivery_order_sn,
        "platformOrderNumber": detail.third_party_order_id or detail.platform_order_id,
        "carrier": detail.carrier,
        "localAmount": detail.delivery_amount,
        "platformAmount": detail.platform_amount,
        "fundAmount": detail.flow_amount,
        "amountDiff": detail.diff_delivery_vs_platform,
        "diffDeliveryVsFlow": detail.diff_delivery_vs_flow,
        "status": detail.status,
        "discrepancyType": detail.discrepancy_type,
        "reason": detail.discrepancy_reason,
        "merchantId": detail.merchant_id,
        "adminId": detail.admin_id,
        "createdAt": detail.order_time.isoformat() if detail.order_time else datetime.utcnow().isoformat(),
        "isOverDeduction": bool(detail.is_over_deduction),
        "isUnderDeduction": bool(detail.is_under_deduction),
        "deliveryStatus": detail.delivery_status,
        "platformOrderStatus": detail.platform_order_status,
        "hasDeliveryData": detail.has_delivery_data,
        "hasFlowData": detail.has_flow_data,
        "hasPlatformData": detail.has_platform_data,
    }


# ==================== API 端点 ====================

@router.get("/tasks", response_model=Dict)
async def get_reconciliation_tasks(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """获取对账任务列表"""
    # 假设所有任务都是对账任务，通过 name 包含 "对账" 或查询是否有 summary 来判断
    query = db.query(Task)
    
    if status:
        query = query.filter(Task.status == status)
    
    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    task_list = [
        {
            "id": str(t.id),
            "name": t.name,
            "status": t.status,
            "progress": t.progress or 0,
            "localOrderCount": 0,
            "platformOrderCount": 0,
            "matchedCount": 0,
            "exceptionCount": 0,
            "totalAmount": 0,
            "matchedAmount": 0,
            "createdAt": t.created_at.isoformat() if t.created_at else None,
            "completedAt": t.finished_at.isoformat() if t.finished_at else None,
        }
        for t in tasks
    ]
    
    return success_with_pagination(task_list, page, pageSize, total)


@router.get("/tasks/{task_id}", response_model=Dict)
async def get_reconciliation_task(
    task_id: str,
    db: Session = Depends(get_db),
):
    """获取单个对账任务详情"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 获取汇总信息
    summary = db.query(ReconciliationSummary).filter(
        ReconciliationSummary.task_id == task_uuid
    ).first()
    
    task_data = {
        "id": str(task.id),
        "name": task.name,
        "status": task.status,
        "progress": task.progress or 0,
        "localOrderCount": summary.total_orders if summary else 0,
        "platformOrderCount": summary.total_orders if summary else 0,
        "matchedCount": summary.matched_orders if summary else 0,
        "exceptionCount": (summary.minor_discrepancy_orders + summary.major_discrepancy_orders) if summary else 0,
        "totalAmount": summary.total_delivery_amount if summary else 0,
        "matchedAmount": summary.matched_orders * (summary.total_delivery_amount / summary.total_orders) if summary and summary.total_orders > 0 else 0,
        "exceptionAmount": abs(summary.total_diff_delivery_vs_platform) if summary else 0,
        "createdAt": task.created_at.isoformat() if task.created_at else None,
        "completedAt": task.finished_at.isoformat() if task.finished_at else None,
    }
    
    return success(task_data)


@router.get("/progress/{task_id}", response_model=Dict)
async def get_reconciliation_progress(
    task_id: str,
    db: Session = Depends(get_db),
):
    """获取任务执行进度"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return error("无效的任务ID", code=400)
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        return error("任务不存在", code=404)
        
    return success({
        "id": str(task.id),
        "name": task.name,
        "status": task.status,
        "progress": task.progress or 0,
        "errorMessage": task.error_message
    })


@router.post("/execute", response_model=Dict)
async def execute_reconciliation(
    params: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    执行对账（兼容 renderer 的 executeReal API）
    """
    print(f"\n[API] === 收到对账请求: {params.get('name')} ===")
    local_file_id = params.get("localFileId") or params.get("delivery_file_id")
    platform_file_id = params.get("platformFileId") or params.get("platform_file_id")
    flow_file_id = params.get("flowFileId") or params.get("flow_file_id")
    platform_id = params.get("platformId") or params.get("platform_id") or "unknown"
    name = params.get("name", f"对账任务 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # 获取文件ID
    file_ids = []
    if local_file_id: file_ids.append(str(local_file_id))
    if platform_file_id: file_ids.append(str(platform_file_id))
    if flow_file_id: file_ids.append(str(flow_file_id))

    # 创建任务
    from app.services.task_crud_service import TaskCRUDService
    task_service = TaskCRUDService(db)
    
    try:
        task = task_service.create(
            name=name,
            description=f"平台: {platform_id}",
            file_ids=file_ids,
            user_id=current_user.id
        )
    except Exception as e:
        import logging
        logging.error(f"创建对账任务失败: {str(e)}", exc_info=True)
        return error(f"创建对账任务失败: {str(e)}", code=500)
    
    # 后台执行（关键修复：正确的 Session 管理和异常处理）
    def run_async(tid: uuid.UUID, fids: list):
        from app.core.database import SessionLocal
        async_db = SessionLocal()
        
        try:
            print(f"\n[ASYNC] 开始后台对账任务: {tid}")
            from app.tasks.executor import TaskExecutionService
            executor = TaskExecutionService(async_db)
            summary = executor.run_reconciliation(tid, fids)
            
            # 验证数据是否真正保存
            from app.models.orm_reconciliation import TripartiteReconciliation
            count = async_db.query(TripartiteReconciliation).filter(
                TripartiteReconciliation.task_id == tid
            ).count()
            print(f"[ASYNC] 验证成功：数据库中已保存 {count} 条对账明细")
            
            if count == 0:
                raise RuntimeError(f"对账引擎声称成功（total={summary.total_orders}），但数据库中没有记录！")
                
        except Exception as async_e:
            import logging
            import traceback
            logging.error(f"后台对账执行失败: {str(async_e)}", exc_info=True)
            print(f"[ASYNC] !!! 致命错误: {str(async_e)}")
            traceback.print_exc()
            
            # 关键修复：更新任务状态为 FAILED
            try:
                from app.services.task_crud_service import TaskCRUDService
                task_service = TaskCRUDService(async_db)
                task_service.set_error(tid, str(async_e))
                async_db.commit()
            except Exception as update_error:
                logging.error(f"更新任务失败状态时出错: {str(update_error)}")
        finally:
            async_db.close()
            print(f"[ASYNC] 任务执行流程结束: {tid}\n")
            
    background_tasks.add_task(run_async, task.id, file_ids)
    
    return success({
        "taskId": str(task.id),
        "status": "processing",
        "message": "已在后台启动对账任务"
    })


@router.get("/results/{task_id}", response_model=Dict)
async def get_reconciliation_results(
    task_id: str,
    db: Session = Depends(get_db),
):
    """获取对账结果（兼容 renderer 的 getResultReal API）"""
    print(f"\n[API/RESULTS] 收到结果请求: task_id={task_id}")
    
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        print(f"[API/RESULTS] 错误：无效的 UUID 格式")
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    # 获取任务
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        print(f"[API/RESULTS] 错误：任务不存在")
        raise HTTPException(status_code=404, detail="任务不存在")
    
    print(f"[API/RESULTS] 任务状态: {task.status}, 进度: {task.progress}")
    
    # 获取汇总
    summary = db.query(ReconciliationSummary).filter(
        ReconciliationSummary.task_id == task_uuid
    ).first()
    
    if not summary:
        print(f"[API/RESULTS] 警告：未找到汇总记录")
        raise HTTPException(status_code=404, detail="对账结果不存在")
    
    print(f"[API/RESULTS] 汇总记录: total_orders={summary.total_orders}, matched={summary.matched_orders}")
    
    # 获取明细
    details = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid
    ).all()
    
    print(f"[API/RESULTS] 查询到 {len(details)} 条明细记录")
    
    # 转换为 renderer 期望的格式
    orders = [convert_detail_to_renderer_format(d) for d in details]
    
    result_data = {
        "task": {
            "id": str(task.id),
            "name": task.name,
            "status": task.status,
            "progress": task.progress or 0,
            "localOrderCount": summary.total_orders,
            "platformOrderCount": summary.total_orders,
            "matchedCount": summary.matched_orders,
            "exceptionCount": summary.minor_discrepancy_orders + summary.major_discrepancy_orders,
            "totalAmount": summary.total_delivery_amount,
            "matchedAmount": summary.matched_orders * (summary.total_delivery_amount / summary.total_orders) if summary.total_orders > 0 else 0,
            "exceptionAmount": abs(summary.total_diff_delivery_vs_platform),
            "createdAt": task.created_at.isoformat() if task.created_at else None,
            "completedAt": task.finished_at.isoformat() if task.finished_at else None,
        },
        "results": {
            "orders": orders,
            "totalLocalAmount": summary.total_delivery_amount,
            "totalPlatformAmount": summary.total_platform_amount,
            "totalFundAmount": summary.total_flow_amount,
            "amountDiff": summary.total_diff_delivery_vs_platform,
        },
        "files": [],
    }
    
    print(f"[API/RESULTS] ✅ 成功返回结果：{len(orders)} 条订单明细")
    return success(result_data)


@router.get("/progress/{task_id}", response_model=Dict)
async def get_reconciliation_progress(
    task_id: str,
    db: Session = Depends(get_db),
):
    """获取对账进度"""
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    progress_data = {
        "id": str(task.id),
        "name": task.name,
        "status": task.status,
        "progress": task.progress or 0,
        "errorMessage": task.error_message,
    }
    
    return success(progress_data)


@router.get("/history", response_model=Dict)
async def get_reconciliation_history(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """获取对账历史"""
    # 假设所有任务都是对账任务
    query = db.query(Task)
    
    if status:
        query = query.filter(Task.status == status)
    
    if search:
        query = query.filter(Task.name.ilike(f"%{search}%"))
    
    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    # 获取每个任务的汇总
    items = []
    for t in tasks:
        summary = db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == t.id
        ).first()
        
        items.append({
            "id": str(t.id),
            "name": t.name,
            "platformId": "unknown",
            "status": t.status,
            "progress": t.progress or 0,
            "localOrderCount": summary.total_orders if summary else 0,
            "platformOrderCount": summary.total_orders if summary else 0,
            "matchedCount": summary.matched_orders if summary else 0,
            "exceptionCount": (summary.minor_discrepancy_orders + summary.major_discrepancy_orders) if summary else 0,
            "totalAmount": summary.total_delivery_amount if summary else 0,
            "matchedAmount": summary.matched_orders * (summary.total_delivery_amount / summary.total_orders) if summary and summary.total_orders > 0 else 0,
            "createdAt": t.created_at.isoformat() if t.created_at else None,
            "completedAt": t.finished_at.isoformat() if t.finished_at else None,
            "totalOrders": summary.total_orders if summary else 0,
            "matchedOrders": summary.matched_orders if summary else 0,
            "matchRate": summary.match_rate if summary else 0,
            "amountDiff": summary.total_diff_delivery_vs_platform if summary else 0,
        })
    
    return success_with_pagination(items, page, pageSize, total)


@router.get("/history/stats", response_model=Dict)
async def get_reconciliation_history_stats(
    db: Session = Depends(get_db),
):
    """获取对账历史统计"""
    # 假设所有任务都是对账任务
    tasks = db.query(Task).all()
    
    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == TaskStatus.FINISHED.value)
    failed = sum(1 for t in tasks if t.status == TaskStatus.FAILED.value)
    cancelled = sum(1 for t in tasks if t.status == TaskStatus.FAILED.value)  # 暂时用 FAILED 代替
    
    # 计算订单统计
    total_orders = 0
    total_matched_orders = 0
    total_amount = 0
    total_matched_amount = 0
    
    for t in tasks:
        summary = db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == t.id
        ).first()
        if summary:
            total_orders += summary.total_orders
            total_matched_orders += summary.matched_orders
            total_amount += summary.total_delivery_amount
    
    stats_data = {
        "total": total,
        "completed": completed,
        "failed": failed,
        "cancelled": cancelled,
        "totalOrders": total_orders,
        "totalMatchedOrders": total_matched_orders,
        "totalAmount": total_amount,
        "totalMatchedAmount": total_matched_amount,
    }
    
    return success(stats_data)


# ==================== 平台级聚合 API ====================

@router.get("/results/{task_id}/by-platform", response_model=Dict)
async def get_results_by_platform(
    task_id: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】按配送平台汇总对账结果
    
    返回各平台的：
    - 订单数、有效订单数
    - 扣款总金额
    - 匹配率、差异数
    - 多扣/少扣统计
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    # 查询平台级聚合数据
    from sqlalchemy import func
    
    platform_stats = db.query(
        TripartiteReconciliation.carrier,
        func.count(TripartiteReconciliation.id).label('total_orders'),
        func.count(func.distinct(TripartiteReconciliation.delivery_order_sn)).label('unique_orders'),
        func.sum(TripartiteReconciliation.delivery_amount).label('total_delivery_amount'),
        func.sum(TripartiteReconciliation.flow_amount).label('total_flow_amount'),
        func.sum(TripartiteReconciliation.platform_amount).label('total_platform_amount'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MATCHED', False)).label('matched_orders'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MINOR', False)).label('minor_discrepancy'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MAJOR', False)).label('major_discrepancy'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MISSING', False)).label('missing_data'),
        func.sum(func.nullif(TripartiteReconciliation.is_over_deduction == True, 0)).label('over_deduction_count'),
        func.sum(func.nullif(TripartiteReconciliation.is_under_deduction == True, 0)).label('under_deduction_count'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid
    ).group_by(TripartiteReconciliation.carrier).all()
    
    platforms = []
    for stat in platform_stats:
        total = stat.total_orders or 0
        matched = stat.matched_orders or 0
        
        platforms.append({
            "carrier": stat.carrier or "未知",
            "total_orders": total,
            "unique_orders": stat.unique_orders or total,
            "valid_orders": stat.unique_orders or total,
            "total_delivery_amount": round(stat.total_delivery_amount or 0, 2),
            "total_flow_amount": round(stat.total_flow_amount or 0, 2),
            "total_platform_amount": round(stat.total_platform_amount or 0, 2),
            "matched_orders": matched,
            "match_rate": round(matched / total * 100, 2) if total > 0 else 0,
            "minor_discrepancy": stat.minor_discrepancy or 0,
            "major_discrepancy": stat.major_discrepancy or 0,
            "missing_data": stat.missing_data or 0,
            "over_deduction_count": stat.over_deduction_count or 0,
            "under_deduction_count": stat.under_deduction_count or 0,
            "discrepancy_orders": (stat.minor_discrepancy or 0) + (stat.major_discrepancy or 0),
        })
    
    return success({
        "task_id": task_id,
        "platforms": sorted(platforms, key=lambda x: x['total_orders'], reverse=True),
    })


@router.get("/results/{task_id}/platforms/{carrier}/summary", response_model=Dict)
async def get_platform_detail_summary(
    task_id: str,
    carrier: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取指定配送平台的详细对账汇总
    
    参数:
        - task_id: 任务ID
        - carrier: 平台名称（如：达达、顺丰、蜂鸟等）
    
    返回:
        - 平台订单统计
        - 金额汇总
        - 差异分析
        - 订单状态分布
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    from sqlalchemy import func
    
    # 基本统计
    stats = db.query(
        func.count(TripartiteReconciliation.id).label('total_orders'),
        func.count(func.distinct(TripartiteReconciliation.delivery_order_sn)).label('unique_orders'),
        func.sum(TripartiteReconciliation.delivery_amount).label('total_delivery_amount'),
        func.sum(TripartiteReconciliation.flow_amount).label('total_flow_amount'),
        func.sum(TripartiteReconciliation.platform_amount).label('total_platform_amount'),
        func.count(func.nullif(TripartiteReconciliation.has_delivery_data == True, False)).label('has_delivery'),
        func.count(func.nullif(TripartiteReconciliation.has_flow_data == True, False)).label('has_flow'),
        func.count(func.nullif(TripartiteReconciliation.has_platform_data == True, False)).label('has_platform'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.carrier == carrier
    ).first()
    
    # 状态分布
    status_dist = db.query(
        TripartiteReconciliation.status,
        func.count(TripartiteReconciliation.id)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.carrier == carrier
    ).group_by(TripartiteReconciliation.status).all()
    
    status_distribution = {s[0]: s[1] for s in status_dist}
    
    # 差异类型分布
    discrepancy_dist = db.query(
        TripartiteReconciliation.discrepancy_type,
        func.count(TripartiteReconciliation.id)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.carrier == carrier,
        TripartiteReconciliation.discrepancy_type != 'NONE'
    ).group_by(TripartiteReconciliation.discrepancy_type).all()
    
    discrepancy_distribution = {d[0]: d[1] for d in discrepancy_dist}
    
    # 配送状态分布
    delivery_status_dist = db.query(
        TripartiteReconciliation.delivery_status,
        func.count(TripartiteReconciliation.id)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.carrier == carrier,
        TripartiteReconciliation.delivery_status.isnot(None)
    ).group_by(TripartiteReconciliation.delivery_status).all()
    
    delivery_status_distribution = {str(d[0] or ''): d[1] for d in delivery_status_dist}
    
    total = stats.total_orders or 0
    matched = status_distribution.get('MATCHED', 0)
    
    return success({
        "task_id": task_id,
        "carrier": carrier,
        "summary": {
            "total_orders": total,
            "unique_orders": stats.unique_orders or total,
            "valid_orders": stats.unique_orders or total,
            "total_delivery_amount": round(stats.total_delivery_amount or 0, 2),
            "total_flow_amount": round(stats.total_flow_amount or 0, 2),
            "total_platform_amount": round(stats.total_platform_amount or 0, 2),
            "match_rate": round(matched / total * 100, 2) if total > 0 else 0,
            "has_delivery_data": stats.has_delivery or 0,
            "has_flow_data": stats.has_flow or 0,
            "has_platform_data": stats.has_platform or 0,
        },
        "status_distribution": status_distribution,
        "discrepancy_distribution": discrepancy_distribution,
        "delivery_status_distribution": delivery_status_distribution,
    })


@router.get("/results/{task_id}/platforms/{carrier}/orders", response_model=Dict)
async def get_platform_orders(
    task_id: str,
    carrier: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取指定平台的订单明细列表
    
    支持分页和状态筛选
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    query = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.carrier == carrier
    )
    
    if status:
        query = query.filter(TripartiteReconciliation.status == status)
    
    total = query.count()
    orders = query.order_by(TripartiteReconciliation.order_time.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    order_list = [convert_detail_to_renderer_format(o) for o in orders]
    
    return success_with_pagination(order_list, page, pageSize, total)


# ==================== 商户级聚合 API ====================

@router.get("/results/{task_id}/by-merchant", response_model=Dict)
async def get_results_by_merchant(
    task_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    【产品能力】按商户汇总对账结果
    
    返回各商户的：
    - 扣款总金额
    - 去重后的订单数
    - 匹配率
    - 多扣/少扣统计
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    from sqlalchemy import func
    
    # 商户级聚合查询
    merchant_stats = db.query(
        TripartiteReconciliation.merchant_id,
        TripartiteReconciliation.admin_id,
        func.count(TripartiteReconciliation.id).label('total_orders'),
        func.count(func.distinct(TripartiteReconciliation.delivery_order_sn)).label('unique_orders'),
        func.sum(TripartiteReconciliation.delivery_amount).label('total_delivery_amount'),
        func.sum(TripartiteReconciliation.flow_amount).label('total_flow_amount'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MATCHED', False)).label('matched_orders'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MINOR', False)).label('minor_discrepancy'),
        func.count(func.nullif(TripartiteReconciliation.status == 'MAJOR', False)).label('major_discrepancy'),
        func.sum(func.nullif(TripartiteReconciliation.is_over_deduction == True, 0)).label('over_deduction_count'),
        func.sum(func.nullif(TripartiteReconciliation.is_under_deduction == True, 0)).label('under_deduction_count'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid
    ).group_by(
        TripartiteReconciliation.merchant_id,
        TripartiteReconciliation.admin_id
    ).subquery()
    
    # 分页
    from sqlalchemy import select
    count_query = select(func.count()).select_from(merchant_stats)
    total = db.execute(count_query).scalar() or 0
    
    merchants = db.query(merchant_stats).offset((page - 1) * pageSize).limit(pageSize).all()
    
    merchant_list = []
    for m in merchants:
        total_orders = m.total_orders or 0
        matched = m.matched_orders or 0
        
        merchant_list.append({
            "merchant_id": m.merchant_id or "未知",
            "admin_id": m.admin_id,
            "total_orders": total_orders,
            "unique_orders": m.unique_orders or total_orders,
            "valid_orders": m.unique_orders or total_orders,
            "total_delivery_amount": round(m.total_delivery_amount or 0, 2),
            "total_flow_amount": round(m.total_flow_amount or 0, 2),
            "matched_orders": matched,
            "match_rate": round(matched / total_orders * 100, 2) if total_orders > 0 else 0,
            "minor_discrepancy": m.minor_discrepancy or 0,
            "major_discrepancy": m.major_discrepancy or 0,
            "over_deduction_count": m.over_deduction_count or 0,
            "under_deduction_count": m.under_deduction_count or 0,
            "discrepancy_orders": (m.minor_discrepancy or 0) + (m.major_discrepancy or 0),
        })
    
    return success_with_pagination({
        "task_id": task_id,
        "merchants": sorted(merchant_list, key=lambda x: x['total_orders'], reverse=True),
    }, page, pageSize, total)


@router.get("/results/{task_id}/merchants/{merchant_id}/summary", response_model=Dict)
async def get_merchant_detail_summary(
    task_id: str,
    merchant_id: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取指定商户的详细对账汇总
    
    参数:
        - task_id: 任务ID
        - merchant_id: 商户ID
    
    返回:
        - 商户订单统计
        - 金额汇总
        - 差异分析
        - 按平台分布
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    from sqlalchemy import func
    
    # 基本统计
    stats = db.query(
        func.count(TripartiteReconciliation.id).label('total_orders'),
        func.count(func.distinct(TripartiteReconciliation.delivery_order_sn)).label('unique_orders'),
        func.sum(TripartiteReconciliation.delivery_amount).label('total_delivery_amount'),
        func.sum(TripartiteReconciliation.flow_amount).label('total_flow_amount'),
        func.sum(TripartiteReconciliation.platform_amount).label('total_platform_amount'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id
    ).first()
    
    # 状态分布
    status_dist = db.query(
        TripartiteReconciliation.status,
        func.count(TripartiteReconciliation.id)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id
    ).group_by(TripartiteReconciliation.status).all()
    
    status_distribution = {s[0]: s[1] for s in status_dist}
    
    # 按平台分布
    carrier_dist = db.query(
        TripartiteReconciliation.carrier,
        func.count(TripartiteReconciliation.id)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id
    ).group_by(TripartiteReconciliation.carrier).all()
    
    carrier_distribution = {c[0] or '未知': c[1] for c in carrier_dist}
    
    # 差异金额汇总
    diff_stats = db.query(
        func.sum(TripartiteReconciliation.diff_delivery_vs_flow).label('total_diff_1v2'),
        func.sum(TripartiteReconciliation.diff_delivery_vs_platform).label('total_diff_1v3'),
        func.sum(TripartiteReconciliation.diff_flow_vs_platform).label('total_diff_2v3'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id
    ).first()
    
    total = stats.total_orders or 0
    matched = status_distribution.get('MATCHED', 0)
    
    return success({
        "task_id": task_id,
        "merchant_id": merchant_id,
        "summary": {
            "total_orders": total,
            "unique_orders": stats.unique_orders or total,
            "valid_orders": stats.unique_orders or total,
            "total_delivery_amount": round(stats.total_delivery_amount or 0, 2),
            "total_flow_amount": round(stats.total_flow_amount or 0, 2),
            "total_platform_amount": round(stats.total_platform_amount or 0, 2),
            "match_rate": round(matched / total * 100, 2) if total > 0 else 0,
            "total_diff_delivery_vs_flow": round(diff_stats.total_diff_1v2 or 0, 2),
            "total_diff_delivery_vs_platform": round(diff_stats.total_diff_1v3 or 0, 2),
            "total_diff_flow_vs_platform": round(diff_stats.total_diff_2v3 or 0, 2),
        },
        "status_distribution": status_distribution,
        "carrier_distribution": carrier_distribution,
    })


@router.get("/results/{task_id}/merchants/{merchant_id}/orders", response_model=Dict)
async def get_merchant_orders(
    task_id: str,
    merchant_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    carrier: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取指定商户的订单明细列表
    
    支持分页、状态筛选、平台筛选
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    query = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id
    )
    
    if status:
        query = query.filter(TripartiteReconciliation.status == status)
    if carrier:
        query = query.filter(TripartiteReconciliation.carrier == carrier)
    
    total = query.count()
    orders = query.order_by(TripartiteReconciliation.order_time.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    order_list = [convert_detail_to_renderer_format(o) for o in orders]
    
    return success_with_pagination(order_list, page, pageSize, total)


@router.get("/results/{task_id}/merchants/{merchant_id}/orders/{order_sn}", response_model=Dict)
async def get_merchant_order_detail(
    task_id: str,
    merchant_id: str,
    order_sn: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取指定商户的某笔订单详情
    
    返回订单的三方金额对比和差异原因
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    order = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.merchant_id == merchant_id,
        TripartiteReconciliation.delivery_order_sn == order_sn
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    return success({
        "task_id": task_id,
        "merchant_id": merchant_id,
        "order": {
            "delivery_order_sn": order.delivery_order_sn,
            "platform_order_id": order.platform_order_id,
            "third_party_order_id": order.third_party_order_id,
            "carrier": order.carrier,
            "delivery_amount": order.delivery_amount,
            "flow_amount": order.flow_amount,
            "platform_amount": order.platform_amount,
            "diff_delivery_vs_flow": order.diff_delivery_vs_flow,
            "diff_delivery_vs_platform": order.diff_delivery_vs_platform,
            "diff_flow_vs_platform": order.diff_flow_vs_platform,
            "status": order.status,
            "discrepancy_type": order.discrepancy_type,
            "discrepancy_reason": order.discrepancy_reason,
            "delivery_status": order.delivery_status,
            "platform_order_status": order.platform_order_status,
            "order_time": order.order_time.isoformat() if order.order_time else None,
            "has_delivery_data": order.has_delivery_data,
            "has_flow_data": order.has_flow_data,
            "has_platform_data": order.has_platform_data,
            "is_over_deduction": order.is_over_deduction,
            "is_under_deduction": order.is_under_deduction,
            "is_amount_mismatch": order.is_amount_mismatch,
        }
    })


# ==================== 订单筛选 API ====================

@router.get("/results/{task_id}/orders", response_model=Dict)
async def get_orders(
    task_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    carrier: Optional[str] = None,
    merchant_id: Optional[str] = None,
    discrepancy_type: Optional[str] = None,
    is_over_deduction: Optional[bool] = None,
    is_under_deduction: Optional[bool] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    【产品能力】订单明细列表（支持多维度筛选）
    
    筛选条件:
        - status: 匹配状态 (MATCHED/MINOR/MAJOR/MISSING)
        - carrier: 配送平台
        - merchant_id: 商户ID
        - discrepancy_type: 差异类型
        - is_over_deduction: 是否多扣款
        - is_under_deduction: 是否少扣款
        - min_amount/max_amount: 金额范围
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    query = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid
    )
    
    if status:
        query = query.filter(TripartiteReconciliation.status == status)
    if carrier:
        query = query.filter(TripartiteReconciliation.carrier == carrier)
    if merchant_id:
        query = query.filter(TripartiteReconciliation.merchant_id == merchant_id)
    if discrepancy_type:
        query = query.filter(TripartiteReconciliation.discrepancy_type == discrepancy_type)
    if is_over_deduction is not None:
        query = query.filter(TripartiteReconciliation.is_over_deduction == is_over_deduction)
    if is_under_deduction is not None:
        query = query.filter(TripartiteReconciliation.is_under_deduction == is_under_deduction)
    if min_amount is not None:
        query = query.filter(TripartiteReconciliation.delivery_amount >= min_amount)
    if max_amount is not None:
        query = query.filter(TripartiteReconciliation.delivery_amount <= max_amount)
    
    total = query.count()
    orders = query.order_by(TripartiteReconciliation.order_time.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    order_list = [convert_detail_to_renderer_format(o) for o in orders]
    
    return success_with_pagination(order_list, page, pageSize, total)


@router.get("/results/{task_id}/orders/{order_sn}", response_model=Dict)
async def get_order_detail(
    task_id: str,
    order_sn: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取订单详情（通过订单号）
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    order = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.delivery_order_sn == order_sn
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    return success({
        "task_id": task_id,
        "order": {
            "delivery_order_sn": order.delivery_order_sn,
            "platform_order_id": order.platform_order_id,
            "third_party_order_id": order.third_party_order_id,
            "merchant_id": order.merchant_id,
            "admin_id": order.admin_id,
            "carrier": order.carrier,
            "delivery_amount": order.delivery_amount,
            "flow_amount": order.flow_amount,
            "platform_amount": order.platform_amount,
            "diff_delivery_vs_flow": order.diff_delivery_vs_flow,
            "diff_delivery_vs_platform": order.diff_delivery_vs_platform,
            "diff_flow_vs_platform": order.diff_flow_vs_platform,
            "status": order.status,
            "discrepancy_type": order.discrepancy_type,
            "discrepancy_reason": order.discrepancy_reason,
            "delivery_status": order.delivery_status,
            "platform_order_status": order.platform_order_status,
            "order_time": order.order_time.isoformat() if order.order_time else None,
            "has_delivery_data": order.has_delivery_data,
            "has_flow_data": order.has_flow_data,
            "has_platform_data": order.has_platform_data,
            "is_over_deduction": order.is_over_deduction,
            "is_under_deduction": order.is_under_deduction,
            "is_amount_mismatch": order.is_amount_mismatch,
        }
    })


# ==================== 差异订单 API ====================

@router.get("/results/{task_id}/discrepancies", response_model=Dict)
async def get_discrepancy_orders(
    task_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    discrepancy_type: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取差异订单列表
    
    默认只返回有差异的订单（MATCHED 除外）
    支持按差异类型和金额范围筛选
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    query = db.query(TripartiteReconciliation).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.status != 'MATCHED'  # 排除完全匹配的订单
    )
    
    if discrepancy_type:
        query = query.filter(TripartiteReconciliation.discrepancy_type == discrepancy_type)
    if min_amount is not None:
        query = query.filter(TripartiteReconciliation.total_discrepancy >= min_amount)
    if max_amount is not None:
        query = query.filter(TripartiteReconciliation.total_discrepancy <= max_amount)
    
    total = query.count()
    orders = query.order_by(TripartiteReconciliation.total_discrepancy.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    
    order_list = [convert_detail_to_renderer_format(o) for o in orders]
    
    return success_with_pagination(order_list, page, pageSize, total)


@router.get("/results/{task_id}/discrepancies/summary", response_model=Dict)
async def get_discrepancy_summary(
    task_id: str,
    db: Session = Depends(get_db),
):
    """
    【产品能力】获取差异汇总统计
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID")
    
    from sqlalchemy import func
    
    # 差异类型统计
    type_stats = db.query(
        TripartiteReconciliation.discrepancy_type,
        func.count(TripartiteReconciliation.id),
        func.sum(TripartiteReconciliation.total_discrepancy)
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.status != 'MATCHED'
    ).group_by(TripartiteReconciliation.discrepancy_type).all()
    
    # 差异金额统计
    amount_stats = db.query(
        func.sum(TripartiteReconciliation.diff_delivery_vs_flow).label('total_diff_1v2'),
        func.sum(TripartiteReconciliation.diff_delivery_vs_platform).label('total_diff_1v3'),
        func.sum(TripartiteReconciliation.diff_flow_vs_platform).label('total_diff_2v3'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.status != 'MATCHED'
    ).first()
    
    # 按平台差异统计
    carrier_stats = db.query(
        TripartiteReconciliation.carrier,
        func.count(TripartiteReconciliation.id).label('count'),
        func.avg(TripartiteReconciliation.total_discrepancy).label('avg_diff'),
    ).filter(
        TripartiteReconciliation.task_id == task_uuid,
        TripartiteReconciliation.status != 'MATCHED'
    ).group_by(TripartiteReconciliation.carrier).all()
    
    discrepancy_types = []
    for s in type_stats:
        discrepancy_types.append({
            "type": s[0],
            "count": s[1],
            "total_amount": round(s[2] or 0, 2),
        })
    
    carrier_list = []
    for s in carrier_stats:
        carrier_list.append({
            "carrier": s[0] or '未知',
            "count": s[1],
            "avg_discrepancy": round(s[2] or 0, 2),
        })
    
    return success({
        "task_id": task_id,
        "total_discrepancy_orders": sum(d['count'] for d in discrepancy_types),
        "by_type": discrepancy_types,
        "amount_summary": {
            "total_diff_delivery_vs_flow": round(amount_stats.total_diff_1v2 or 0, 2),
            "total_diff_delivery_vs_platform": round(amount_stats.total_diff_1v3 or 0, 2),
            "total_diff_flow_vs_platform": round(amount_stats.total_diff_2v3 or 0, 2),
        },
        "by_carrier": sorted(carrier_list, key=lambda x: x['count'], reverse=True),
    })


# ===== HTML 报表导出 =====

@router.get("/reconciliation/report/html")
def generate_html_report(
    task_id: str,
    include_details: bool = Query(True, description="包含订单明细"),
    include_discrepancies: bool = Query(True, description="包含差异订单"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】生成 HTML 对账报表

    返回完整的 HTML 报表，包含：
    - 汇总统计
    - 差异统计
    - 平台级聚合
    - 商户级聚合
    - 特殊订单统计
    - 差异订单明细

    可直接在浏览器中打开或打印
    """
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的任务ID格式")
    
    # 导入报表服务
    from app.services.report_service import HTMLReportService
    
    try:
        service = HTMLReportService(db)
        html_content = service.generate_reconciliation_report(
            task_uuid,
            include_details=include_details,
            include_discrepancies=include_discrepancies,
        )
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content, media_type="text/html; charset=utf-8")
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
