"""
统计 API 路由 - 前端兼容的 API 设计
"""

from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.services.statistics_service import (
    DeliveryStatisticsService,
    FlowStatisticsService,
    ReconciliationStatisticsService,
    AlertService,
)

router = APIRouter(tags=["statistics"])


# ===== 配送单统计 API =====

@router.get("/delivery/carrier-summary")
def get_delivery_carrier_summary(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取配送单按平台汇总
    
    返回各配送平台的订单数、金额、状态分布
    """
    try:
        service = DeliveryStatisticsService(db)
        result = service.get_carrier_summary(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/delivery/status-distribution")
def get_delivery_status_distribution(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取配送状态分布
    
    返回各状态的订单数量
    """
    try:
        service = DeliveryStatisticsService(db)
        result = service.get_status_distribution(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/delivery/trend")
def get_delivery_trend(
    task_id: str,
    granularity: str = Query("day", regex="^(day|week|month)$"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取配送趋势分析
    
    返回指定时间粒度的订单数和金额趋势
    """
    try:
        service = DeliveryStatisticsService(db)
        result = service.get_trend_analysis(task_id, granularity)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/delivery/details")
def get_delivery_details(
    task_id: str,
    carrier: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取配送单明细
    
    支持按平台和状态筛选，分页查询
    """
    try:
        service = DeliveryStatisticsService(db)
        result = service.get_delivery_details(task_id, carrier, status, page, page_size)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 流水单统计 API =====

@router.get("/flow/merchant-summary")
def get_flow_merchant_summary(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取商户流水汇总（基础版）

    返回各商户的扣款统计
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_merchant_summary(uuid.UUID(task_id))
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/merchant-summary-enhanced")
def get_flow_merchant_summary_enhanced(
    task_id: str,
    admin_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取商户流水汇总（增强版）

    返回各商户的完整流水统计，包括：
    - 扣款 (type=1): 订单数、总金额、平均金额
    - 奖励 (type=2, method=3): 笔数、金额
    - 充值 (type=2, method∈[1,2]): 笔数、金额
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_merchant_summary_enhanced(uuid.UUID(task_id), admin_id=admin_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/merchant-details")
def get_flow_merchant_details(
    task_id: str,
    admin_id: str,
    flow_type: Optional[int] = Query(None, ge=1, le=2, description="交易类型: 1=扣款, 2=充值/奖励"),
    method: Optional[int] = Query(None, ge=1, le=3, description="支付方式: 1=余额, 2=线上, 3=新客奖励"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取商户订单明细

    支持按交易类型和支付方式筛选:
    - flow_type=1: 扣款记录
    - flow_type=2: 充值/奖励记录
    - method=1: 余额支付/充值
    - method=2: 线上支付/充值
    - method=3: 新客奖励
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_filtered_orders(
            uuid.UUID(task_id),
            flow_type=flow_type,
            method=method,
            admin_id=admin_id,
            page=page,
            page_size=page_size,
        )
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/orders")
def get_flow_orders(
    task_id: str,
    flow_type: Optional[int] = Query(None, ge=1, le=2, description="交易类型: 1=扣款, 2=充值/奖励"),
    method: Optional[int] = Query(None, ge=1, le=3, description="支付方式: 1=余额, 2=线上, 3=新客奖励"),
    admin_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取流水订单列表（支持类型筛选）

    按交易类型和支付方式筛选流水订单:
    - flow_type=1: 扣款记录 (配送费、取消扣款等)
    - flow_type=2: 充值/奖励记录
    - method=1: 余额支付/充值
    - method=2: 线上支付/充值
    - method=3: 新客奖励 (仅 type=2)

    组合示例:
    - flow_type=1, method=1: 余额支付配送费
    - flow_type=1, method=2: 线上支付配送费
    - flow_type=2, method=1: 余额充值
    - flow_type=2, method=2: 线上充值
    - flow_type=2, method=3: 新客奖励
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_filtered_orders(
            uuid.UUID(task_id),
            flow_type=flow_type,
            method=method,
            admin_id=admin_id,
            page=page,
            page_size=page_size,
        )
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/summary")
def get_flow_summary(
    task_id: str,
    flow_type: Optional[int] = Query(None, ge=1, le=2, description="交易类型: 1=扣款, 2=充值/奖励"),
    method: Optional[int] = Query(None, ge=1, le=3, description="支付方式: 1=余额, 2=线上, 3=新客奖励"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取流水汇总统计（支持类型筛选）

    按交易类型和支付方式筛选，统计各商户的流水汇总:
    - flow_type=1: 扣款汇总
    - flow_type=2: 充值/奖励汇总
    - method: 进一步筛选支付方式
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_filtered_summary(
            uuid.UUID(task_id),
            flow_type=flow_type,
            method=method,
        )
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/deduction-type")
def get_deduction_type_stats(
    task_id: str,
    admin_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取扣款类型统计

    返回各扣款类型的数量和金额
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_deduction_type_stats(task_id, admin_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/special-orders")
def get_special_orders_stats(
    task_id: str,
    admin_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取特殊订单统计

    识别并统计特殊订单类型：
    - 退款订单: memo 包含"退还"或"退款"
    - 罚款订单: memo 包含"罚款"或"超时"或"投诉"
    - 补差价订单: memo 包含"补差价"

    返回各类型的数量和金额
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_special_orders_stats(uuid.UUID(task_id), admin_id=admin_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/reward-recharge-summary")
def get_reward_recharge_summary(
    task_id: str,
    admin_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取奖励和充值汇总

    返回新客奖励、充值金额统计（老系统功能迁移）

    功能说明:
    - type=2, method=3: 新客奖励 (new_customer_reward)
    - type=2, method∈[1,2]: 用户充值 (user_recharge)
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_reward_recharge_summary(task_id, admin_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flow/balance-validation")
def get_balance_validation(
    task_id: str,
    admin_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    【产品能力】获取余额校验结果

    验证公式: Initial + Reward + Recharge - Deduction = Final Balance

    返回:
    - 各商户的初始余额、最终余额、扣款、奖励、充值
    - 差异金额 (如果有)
    - 是否通过校验
    """
    try:
        service = FlowStatisticsService(db)
        result = service.get_balance_validation(task_id, admin_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 对账统计 API =====

@router.get("/reconciliation/summary")
def get_reconciliation_summary(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取对账汇总
    
    返回三方对账的核心汇总数据
    """
    try:
        service = ReconciliationStatisticsService(db)
        result = service.get_summary(task_id)
        if not result:
            raise HTTPException(status_code=404, detail="任务不存在或未完成对账")
        return {"code": 200, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation/discrepancies")
def get_discrepancy_details(
    task_id: str,
    discrepancy_type: Optional[str] = None,
    carrier: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取差异明细
    
    返回异常订单的详细信息，支持按类型和平台筛选
    """
    try:
        service = ReconciliationStatisticsService(db)
        result = service.get_discrepancy_details(task_id, discrepancy_type, carrier, page, page_size)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation/amount-comparison")
def get_amount_comparison(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取金额三方对比
    
    返回配送单、流水单、三方账单的金额对比
    """
    try:
        service = ReconciliationStatisticsService(db)
        result = service.get_amount_comparison(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation/discrepancy-trend")
def get_discrepancy_trend(
    task_id: str,
    granularity: str = Query("day", regex="^(day|week|month)$"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取差异趋势
    
    返回指定时间粒度的差异分布
    """
    try:
        service = ReconciliationStatisticsService(db)
        result = service.get_discrepancy_trend(task_id, granularity)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation/platform-comparison")
def get_platform_comparison(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取按平台对比
    
    返回各平台的配送单vs三方账单对比
    """
    try:
        service = ReconciliationStatisticsService(db)
        result = service.get_platform_comparison(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 预警 API =====

@router.get("/alerts/anomalies")
def get_anomalies(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取异常检测结果
    
    返回各类异常的检测结果
    """
    try:
        service = AlertService(db)
        result = service.detect_anomalies(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 仪表盘 API =====

@router.get("/dashboard")
def get_dashboard_data(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    获取仪表盘数据
    
    返回前端仪表盘所需的所有数据
    """
    try:
        service = AlertService(db)
        result = service.get_dashboard_data(task_id)
        return {"code": 200, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
