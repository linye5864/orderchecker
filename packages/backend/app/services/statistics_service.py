"""
统计服务 - 提供各类统计数据的查询
"""

import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from app.models.orm_delivery import DeliveryOrder, DeliverySummary
from app.models.orm_flow import FlowRecord, MerchantSummary
from app.models.orm_platform import PlatformBill, PlatformSummary
from app.models.orm_reconciliation import (
    TripartiteReconciliation,
    ReconciliationSummary,
    ReconciliationStatus,
    DiscrepancyType,
)


class StatisticsService:
    """统计服务基类"""
    
    def __init__(self, db: Session):
        self.db = db


class DeliveryStatisticsService(StatisticsService):
    """
    配送单统计服务
    能力：按平台/状态/商户维度统计配送数据
    """
    
    def get_carrier_summary(self, task_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        按配送平台汇总
        
        返回：
        - 平台名称
        - 订单总数
        - 总配送金额
        - 平均配送费
        - 状态分布
        """
        # 按平台分组统计
        stats = self.db.query(
            DeliveryOrder.carrier,
            func.count(DeliveryOrder.id).label('order_count'),
            func.sum(DeliveryOrder.free).label('total_amount'),
            func.avg(DeliveryOrder.free).label('avg_amount'),
        ).filter(
            DeliveryOrder.task_id == task_id
        ).group_by(DeliveryOrder.carrier).all()
        
        result = []
        for stat in stats:
            # 获取该平台的状态分布
            status_stats = self.db.query(
                DeliveryOrder.delivery_status,
                func.count(DeliveryOrder.id).label('count'),
            ).filter(
                and_(
                    DeliveryOrder.task_id == task_id,
                    DeliveryOrder.carrier == stat.carrier,
                )
            ).group_by(DeliveryOrder.delivery_status).all()
            
            status_distribution = {s.delivery_status: s.count for s in status_stats}
            
            result.append({
                "carrier": stat.carrier or "未知",
                "order_count": stat.order_count or 0,
                "total_amount": round(stat.total_amount or 0, 2),
                "avg_amount": round(stat.avg_amount or 0, 2),
                "status_distribution": status_distribution,
            })
        
        return result
    
    def get_status_distribution(self, task_id: uuid.UUID) -> Dict[str, int]:
        """
        配送状态分布
        
        状态：已完成/配送中/已取消/异常等
        """
        stats = self.db.query(
            DeliveryOrder.delivery_status,
            func.count(DeliveryOrder.id).label('count'),
        ).filter(
            DeliveryOrder.task_id == task_id
        ).group_by(DeliveryOrder.delivery_status).all()
        
        return {stat.delivery_status or "未知": stat.count for stat in stats}
    
    def get_trend_analysis(
        self,
        task_id: uuid.UUID,
        granularity: str = "day",
    ) -> List[Dict[str, Any]]:
        """
        趋势分析
        
        返回指定时间粒度的订单数和金额趋势
        """
        if granularity == "day":
            date_format = "%Y-%m-%d"
            date_column = func.date_format(DeliveryOrder.create_time, date_format)
        elif granularity == "week":
            date_format = "%Y-%u"  # 年-周数
            date_column = func.date_format(DeliveryOrder.create_time, date_format)
        else:
            date_format = "%Y-%m"
            date_column = func.date_format(DeliveryOrder.create_time, date_format)
        
        stats = self.db.query(
            date_column.label('period'),
            func.count(DeliveryOrder.id).label('order_count'),
            func.sum(DeliveryOrder.free).label('total_amount'),
        ).filter(
            DeliveryOrder.task_id == task_id
        ).group_by('period').order_by('period').all()
        
        return [
            {
                "period": stat.period,
                "order_count": stat.order_count,
                "total_amount": round(stat.total_amount or 0, 2),
            }
            for stat in stats
        ]
    
    def get_delivery_details(
        self,
        task_id: uuid.UUID,
        carrier: str = None,
        status: str = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """
        获取配送单明细
        
        支持按平台和状态筛选
        """
        query = self.db.query(DeliveryOrder).filter(
            DeliveryOrder.task_id == task_id
        )
        
        if carrier:
            query = query.filter(DeliveryOrder.carrier == carrier)
        if status:
            query = query.filter(DeliveryOrder.delivery_status == status)
        
        # 总数
        total = query.count()
        
        # 分页
        orders = query.order_by(DeliveryOrder.create_time.desc()).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        return {
            "items": [
                {
                    "order_sn": order.delivery_order_sn,
                    "carrier": order.carrier,
                    "status": order.delivery_status,
                    "amount": order.free,
                    "create_time": order.create_time.isoformat() if order.create_time else None,
                }
                for order in orders
            ],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            }
        }


class FlowStatisticsService(StatisticsService):
    """
    流水单统计服务
    能力：以商户为中心的账户流水和订单明细
    """
    
    def get_merchant_summary(self, task_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        商户汇总
        
        返回：
        - 商户ID
        - 扣款笔数
        - 扣款总金额
        - 平均扣款
        """
        stats = self.db.query(
            FlowRecord.admin_id,
            func.count(func.distinct(FlowRecord.delivery_order_id)).label('order_count'),
            func.sum(func.abs(FlowRecord.money)).label('total_amount'),
            func.avg(func.abs(FlowRecord.money)).label('avg_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 1,  # 扣款
            )
        ).group_by(FlowRecord.admin_id).all()
        
        return [
            {
                "admin_id": stat.admin_id or "未知",
                "order_count": stat.order_count or 0,
                "total_amount": round(stat.total_amount or 0, 2),
                "avg_amount": round(stat.avg_amount or 0, 2),
            }
            for stat in stats
        ]
    
    def get_merchant_summary_enhanced(
        self, task_id: uuid.UUID, admin_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        商户汇总（增强版）

        返回：
        - 商户ID
        - 扣款 (type=1): 订单数、总金额、平均金额
        - 奖励 (type=2, method=3): 笔数、金额
        - 充值 (type=2, method∈[1,2]): 笔数、金额
        """
        # 1. 获取扣款统计 (type=1)
        deduction_query = self.db.query(
            FlowRecord.admin_id,
            func.count(func.distinct(FlowRecord.delivery_order_id)).label('order_count'),
            func.sum(func.abs(FlowRecord.money)).label('total_amount'),
            func.avg(func.abs(FlowRecord.money)).label('avg_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 1,  # 扣款
            )
        )
        
        if admin_id:
            deduction_query = deduction_query.filter(FlowRecord.admin_id == admin_id)
        
        deduction_stats = deduction_query.group_by(FlowRecord.admin_id).all()
        deduction_by_admin = {
            s.admin_id: {
                "order_count": s.order_count or 0,
                "total_amount": round(s.total_amount or 0, 2),
                "avg_amount": round(s.avg_amount or 0, 2),
            }
            for s in deduction_stats
        }
        
        # 2. 获取奖励统计 (type=2, method=3)
        reward_query = self.db.query(
            FlowRecord.admin_id,
            func.count(FlowRecord.id).label('reward_count'),
            func.sum(FlowRecord.money).label('reward_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 2,  # 充值/奖励
                FlowRecord.method == 3,  # 新客奖励
            )
        )
        
        if admin_id:
            reward_query = reward_query.filter(FlowRecord.admin_id == admin_id)
        
        reward_stats = reward_query.group_by(FlowRecord.admin_id).all()
        reward_by_admin = {
            s.admin_id: {
                "count": s.reward_count or 0,
                "amount": round(s.reward_amount or 0, 2),
            }
            for s in reward_stats
        }
        
        # 3. 获取充值统计 (type=2, method∈[1,2])
        recharge_query = self.db.query(
            FlowRecord.admin_id,
            func.count(FlowRecord.id).label('recharge_count'),
            func.sum(FlowRecord.money).label('recharge_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 2,  # 充值/奖励
                FlowRecord.method.in_([1, 2]),  # 充值
            )
        )
        
        if admin_id:
            recharge_query = recharge_query.filter(FlowRecord.admin_id == admin_id)
        
        recharge_stats = recharge_query.group_by(FlowRecord.admin_id).all()
        recharge_by_admin = {
            s.admin_id: {
                "count": s.recharge_count or 0,
                "amount": round(s.recharge_amount or 0, 2),
            }
            for s in recharge_stats
        }
        
        # 合并所有商户
        all_admin_ids = set(deduction_by_admin.keys()) | set(reward_by_admin.keys()) | set(recharge_by_admin.keys())
        
        result = []
        for adm_id in sorted(all_admin_ids):
            deduction = deduction_by_admin.get(adm_id, {"order_count": 0, "total_amount": 0, "avg_amount": 0})
            reward = reward_by_admin.get(adm_id, {"count": 0, "amount": 0})
            recharge = recharge_by_admin.get(adm_id, {"count": 0, "amount": 0})
            
            result.append({
                "admin_id": adm_id or "未知",
                "deduction": {
                    "order_count": deduction["order_count"],
                    "total_amount": deduction["total_amount"],
                    "avg_amount": deduction["avg_amount"],
                },
                "reward": {
                    "count": reward["count"],
                    "amount": reward["amount"],
                },
                "recharge": {
                    "count": recharge["count"],
                    "amount": recharge["amount"],
                },
            })
        
        return result
    
    def get_merchant_order_details(
        self,
        task_id: uuid.UUID,
        admin_id: str,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """
        商户订单明细
        
        返回：
        - 订单号
        - 配送平台
        - 配送状态
        - 扣款金额
        - 扣款时间
        """
        # 关联查询
        records = self.db.query(FlowRecord).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.admin_id == admin_id,
                FlowRecord.type == 1,  # 扣款
            )
        ).order_by(FlowRecord.createtime.desc()).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        total = self.db.query(FlowRecord).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.admin_id == admin_id,
                FlowRecord.type == 1,
            )
        ).count()
        
        items = []
        for record in records:
            # 尝试关联配送单获取更多信息
            delivery = self.db.query(DeliveryOrder).filter(
                DeliveryOrder.delivery_order_sn == record.delivery_order_id
            ).first()
            
            items.append({
                "order_id": record.delivery_order_id,
                "amount": record.deduction_amount,
                "balance_before": record.before,
                "balance_after": record.after,
                "carrier": delivery.carrier if delivery else None,
                "delivery_status": delivery.delivery_status if delivery else None,
                "trade_time": record.createtime.isoformat() if record.createtime else None,
            })
        
        return {
            "items": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            }
        }
    
    def get_filtered_orders(
        self,
        task_id: uuid.UUID,
        flow_type: Optional[int] = None,
        method: Optional[int] = None,
        admin_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """
        获取按类型筛选的流水订单
        
        参数:
        - flow_type: 交易类型 (1=扣款, 2=充值/奖励)
        - method: 支付方式 (1=余额, 2=线上, 3=新客奖励)
        - admin_id: 商户ID (可选)
        
        返回:
        - 筛选后的订单列表
        """
        # 构建查询条件
        filters = [FlowRecord.task_id == task_id]
        
        if flow_type is not None:
            filters.append(FlowRecord.type == flow_type)
        
        if method is not None:
            filters.append(FlowRecord.method == method)
        
        if admin_id:
            filters.append(FlowRecord.admin_id == admin_id)
        
        # 查询记录
        records = self.db.query(FlowRecord).filter(
            and_(*filters)
        ).order_by(FlowRecord.createtime.desc()).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        total = self.db.query(FlowRecord).filter(
            and_(*filters)
        ).count()
        
        items = []
        for record in records:
            # 尝试关联配送单获取更多信息
            delivery = self.db.query(DeliveryOrder).filter(
                DeliveryOrder.delivery_order_sn == record.delivery_order_id
            ).first()
            
            # 根据 type 和 method 确定类型名称
            if record.type == 1:
                if record.method == 1:
                    type_name = "配送费-余额支付"
                elif record.method == 2:
                    type_name = "配送费-线上支付"
                else:
                    type_name = "扣款-其他"
            elif record.type == 2:
                if record.method == 1:
                    type_name = "充值-余额充值"
                elif record.method == 2:
                    type_name = "充值-线上充值"
                elif record.method == 3:
                    type_name = "新客奖励"
                else:
                    type_name = "收入-其他"
            else:
                type_name = f"类型{record.type}"
            
            items.append({
                "order_id": record.delivery_order_id,
                "order_sn": record.order_sn,
                "type": record.type,
                "type_name": type_name,
                "method": record.method,
                "amount": record.money,
                "balance_before": record.before,
                "balance_after": record.after,
                "carrier": delivery.carrier if delivery else None,
                "delivery_status": delivery.delivery_status if delivery else None,
                "trade_time": record.createtime.isoformat() if record.createtime else None,
                "memo": record.memo,
            })
        
        return {
            "items": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
            "filters": {
                "type": flow_type,
                "method": method,
                "admin_id": admin_id,
            }
        }
    
    def get_filtered_summary(
        self,
        task_id: uuid.UUID,
        flow_type: Optional[int] = None,
        method: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        获取按类型筛选的汇总统计
        
        参数:
        - flow_type: 交易类型 (1=扣款, 2=充值/奖励)
        - method: 支付方式 (可选)
        
        返回:
        - 筛选后的汇总统计
        """
        # 构建查询条件
        filters = [FlowRecord.task_id == task_id]
        
        if flow_type is not None:
            filters.append(FlowRecord.type == flow_type)
        
        if method is not None:
            filters.append(FlowRecord.method == method)
        
        # 按商户汇总
        stats = self.db.query(
            FlowRecord.admin_id,
            func.count(FlowRecord.id).label('count'),
            func.sum(FlowRecord.money).label('total_amount'),
        ).filter(
            and_(*filters)
        ).group_by(FlowRecord.admin_id).all()
        
        # 总体统计
        total_stats = self.db.query(
            func.count(FlowRecord.id).label('count'),
            func.sum(FlowRecord.money).label('total_amount'),
        ).filter(
            and_(*filters)
        ).first()
        
        merchants = []
        for stat in stats:
            merchants.append({
                "admin_id": stat.admin_id,
                "count": stat.count,
                "total_amount": round(stat.total_amount or 0, 2),
            })
        
        return {
            "summary": {
                "total_count": total_stats.count or 0,
                "total_amount": round(total_stats.total_amount or 0, 2),
                "merchant_count": len(merchants),
            },
            "by_merchant": sorted(merchants, key=lambda x: x['total_amount'], reverse=True),
            "filters": {
                "type": flow_type,
                "method": method,
            }
        }
    
    def get_deduction_type_stats(
        self,
        task_id: uuid.UUID,
        admin_id: str = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        扣款类型统计
        
        类型：配送费 / 取消扣款 / 投诉扣款 / 其他
        """
        query = self.db.query(
            FlowRecord.method,
            func.count(FlowRecord.id).label('count'),
            func.sum(func.abs(FlowRecord.money)).label('total_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 1,  # 扣款
            )
        )
        
        if admin_id:
            query = query.filter(FlowRecord.admin_id == admin_id)
        
        stats = query.group_by(FlowRecord.method).all()
        
        # method 映射
        method_names = {
            1: "余额支付",
            2: "线上支付",
            3: "新客奖励/其他",
        }
        
        result = {}
        for stat in stats:
            method_name = method_names.get(stat.method, f"类型{stat.method}")
            result[method_name] = {
                "count": stat.count,
                "total_amount": round(stat.total_amount or 0, 2),
            }
        
        return result

    def get_special_orders_stats(
        self,
        task_id: uuid.UUID,
        admin_id: str = None,
    ) -> Dict[str, Any]:
        """
        特殊订单统计（退款、罚款等）

        识别规则：
        - 退款订单: memo 包含"退还"或"退款"
        - 罚款订单: memo 包含"罚款"或"超时"或"投诉"
        - 补差价订单: memo 包含"补差价"

        返回各类特殊订单的数量和金额
        """
        # 构建基础查询
        base_query = self.db.query(FlowRecord).filter(
            FlowRecord.task_id == task_id,
            FlowRecord.memo != None,
            FlowRecord.memo != '',
        )
        
        if admin_id:
            base_query = base_query.filter(FlowRecord.admin_id == admin_id)
        
        all_records = base_query.all()
        
        # 分类统计
        refund_count = 0
        refund_amount = 0
        penalty_count = 0
        penalty_amount = 0
        discount_count = 0
        discount_amount = 0
        other_count = 0
        other_amount = 0
        
        for record in all_records:
            memo = record.memo or ""
            money = record.money or 0
            
            if "退还" in memo or "退款" in memo:
                # 退款订单（金额通常为正，表示退还）
                refund_count += 1
                refund_amount += money
            elif "罚款" in memo or "超时" in memo or "投诉" in memo:
                # 罚款订单（金额通常为负）
                penalty_count += 1
                penalty_amount += abs(money)
            elif "补差价" in memo:
                # 补差价订单
                discount_count += 1
                discount_amount += abs(money)
            else:
                # 其他特殊订单
                other_count += 1
                other_amount += abs(money)
        
        # 按商户汇总
        merchant_stats = {}
        for record in all_records:
            memo = record.memo or ""
            adm_id = record.admin_id or "未知"
            money = record.money or 0
            
            if adm_id not in merchant_stats:
                merchant_stats[adm_id] = {
                    "refund": {"count": 0, "amount": 0},
                    "penalty": {"count": 0, "amount": 0},
                    "discount": {"count": 0, "amount": 0},
                    "other": {"count": 0, "amount": 0},
                }
            
            if "退还" in memo or "退款" in memo:
                merchant_stats[adm_id]["refund"]["count"] += 1
                merchant_stats[adm_id]["refund"]["amount"] += money
            elif "罚款" in memo or "超时" in memo or "投诉" in memo:
                merchant_stats[adm_id]["penalty"]["count"] += 1
                merchant_stats[adm_id]["penalty"]["amount"] += abs(money)
            elif "补差价" in memo:
                merchant_stats[adm_id]["discount"]["count"] += 1
                merchant_stats[adm_id]["discount"]["amount"] += abs(money)
            else:
                merchant_stats[adm_id]["other"]["count"] += 1
                merchant_stats[adm_id]["other"]["amount"] += abs(money)
        
        return {
            "summary": {
                "refund": {
                    "count": refund_count,
                    "amount": round(refund_amount, 2),
                },
                "penalty": {
                    "count": penalty_count,
                    "amount": round(penalty_amount, 2),
                },
                "discount": {
                    "count": discount_count,
                    "amount": round(discount_amount, 2),
                },
                "other": {
                    "count": other_count,
                    "amount": round(other_amount, 2),
                },
            },
            "by_merchant": [
                {
                    "admin_id": adm_id,
                    **stats
                }
                for adm_id, stats in sorted(merchant_stats.items())
            ]
        }

    def get_reward_recharge_summary(
        self,
        task_id: uuid.UUID,
        admin_id: str = None,
    ) -> Dict[str, Any]:
        """
        获取奖励和充值汇总

        功能说明 (老系统功能迁移):
        - type=2, method=3: 新客奖励 (new_customer_reward)
        - type=2, method∈[1,2]: 用户充值 (user_recharge)

        返回:
        - 新客奖励总额和笔数
        - 充值总额和笔数
        - 按商户分组
        """
        # 查询新客奖励 (type=2, method=3)
        reward_query = self.db.query(
            FlowRecord.admin_id,
            func.count(FlowRecord.id).label('count'),
            func.sum(FlowRecord.money).label('amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 2,  # 充值/奖励类型
                FlowRecord.method == 3,  # 新客奖励
            )
        )

        if admin_id:
            reward_query = reward_query.filter(FlowRecord.admin_id == admin_id)

        reward_stats = reward_query.group_by(FlowRecord.admin_id).all()

        # 查询充值 (type=2, method∈[1,2])
        recharge_query = self.db.query(
            FlowRecord.admin_id,
            func.count(FlowRecord.id).label('count'),
            func.sum(FlowRecord.money).label('amount'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 2,  # 充值/奖励类型
                FlowRecord.method.in_([1, 2]),  # 充值类型
            )
        )

        if admin_id:
            recharge_query = recharge_query.filter(FlowRecord.admin_id == admin_id)

        recharge_stats = recharge_query.group_by(FlowRecord.admin_id).all()

        # 汇总
        reward_by_admin = {r.admin_id: {"count": r.count, "amount": r.amount or 0} for r in reward_stats}
        recharge_by_admin = {r.admin_id: {"count": r.count, "amount": r.amount or 0} for r in recharge_stats}

        # 所有商户ID
        all_admin_ids = set(reward_by_admin.keys()) | set(recharge_by_admin.keys())

        merchants = []
        for adm_id in sorted(all_admin_ids):
            reward = reward_by_admin.get(adm_id, {"count": 0, "amount": 0})
            recharge = recharge_by_admin.get(adm_id, {"count": 0, "amount": 0})

            merchants.append({
                "admin_id": adm_id or "未知",
                "new_customer_reward": {
                    "count": reward["count"],
                    "amount": round(reward["amount"], 2),
                },
                "user_recharge": {
                    "count": recharge["count"],
                    "amount": round(recharge["amount"], 2),
                },
            })

        # 总体汇总
        total_reward_count = sum(r["count"] for r in reward_by_admin.values())
        total_reward_amount = sum(r["amount"] for r in reward_by_admin.values())
        total_recharge_count = sum(r["count"] for r in recharge_by_admin.values())
        total_recharge_amount = sum(r["amount"] for r in recharge_by_admin.values())

        return {
            "summary": {
                "total_new_customer_reward_count": total_reward_count,
                "total_new_customer_reward_amount": round(total_reward_amount, 2),
                "total_user_recharge_count": total_recharge_count,
                "total_user_recharge_amount": round(total_recharge_amount, 2),
            },
            "by_merchant": merchants,
        }

    def get_balance_validation(
        self,
        task_id: uuid.UUID,
        admin_id: str = None,
    ) -> Dict[str, Any]:
        """
        余额校验

        验证公式: Initial + Reward + Recharge - Deduction = Final Balance

        功能说明 (老系统功能迁移):
        - 初始余额 (before, 最早一条记录)
        - 最终余额 (after, 最晚一条记录)
        - 新客奖励 (type=2, method=3)
        - 用户充值 (type=2, method∈[1,2])
        - 扣款 (type=1)

        返回:
        - 各商户的余额校验结果
        - 差异金额
        - 是否通过校验
        """
        # 获取所有商户
        admin_query = self.db.query(FlowRecord.admin_id).filter(
            FlowRecord.task_id == task_id
        ).distinct()

        if admin_id:
            admin_query = admin_query.filter(FlowRecord.admin_id == admin_id)

        admin_ids = [a[0] for a in admin_query.all()]

        merchants = []
        passed = 0
        failed = 0

        for adm_id in admin_ids:
            # 获取该商户的所有记录，按时间排序
            records = self.db.query(FlowRecord).filter(
                and_(
                    FlowRecord.task_id == task_id,
                    FlowRecord.admin_id == adm_id,
                )
            ).order_by(FlowRecord.createtime.asc()).all()

            if not records:
                continue

            # 初始余额 (第一条记录的 before)
            initial_balance = records[0].before if records[0].before else 0
            # 最终余额 (最后一条记录的 after)
            final_balance = records[-1].after if records[-1].after else 0

            # 计算各项
            new_customer_reward = sum(
                r.money for r in records
                if r.type == 2 and r.method == 3
            )
            user_recharge = sum(
                r.money for r in records
                if r.type == 2 and r.method in [1, 2]
            )
            deduction = sum(
                abs(r.money) for r in records
                if r.type == 1
            )

            # 计算预期最终余额
            expected_final = initial_balance + new_customer_reward + user_recharge - deduction

            # 计算差异
            diff = final_balance - expected_final
            is_passed = abs(diff) < 0.01  # 允许0.01的精度误差

            if is_passed:
                passed += 1
            else:
                failed += 1

            merchants.append({
                "admin_id": adm_id,
                "initial_balance": round(initial_balance, 2),
                "final_balance": round(final_balance, 2),
                "new_customer_reward": round(new_customer_reward, 2),
                "user_recharge": round(user_recharge, 2),
                "deduction": round(deduction, 2),
                "expected_final": round(expected_final, 2),
                "actual_final": round(final_balance, 2),
                "difference": round(diff, 2),
                "is_passed": is_passed,
            })

        return {
            "summary": {
                "total_merchants": len(merchants),
                "passed": passed,
                "failed": failed,
                "pass_rate": round(passed / len(merchants) * 100, 2) if merchants else 0,
            },
            "by_merchant": sorted(merchants, key=lambda x: not x["is_passed"]),
        }


class ReconciliationStatisticsService(StatisticsService):
    """
    对账统计服务
    能力：三方对账汇总、差异明细、金额对比
    """
    
    def get_summary(self, task_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """获取对账汇总"""
        summary = self.db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task_id
        ).first()
        
        if not summary:
            return None
        
        return {
            "task_id": str(summary.task_id),
            "total_orders": summary.total_orders,
            "matched_orders": summary.matched_orders,
            "minor_discrepancy_orders": summary.minor_discrepancy_orders,
            "major_discrepancy_orders": summary.major_discrepancy_orders,
            "missing_data_orders": summary.missing_data_orders,
            "match_rate": summary.match_rate,
            "discrepancy_rate": summary.discrepancy_rate,
            "amount_summary": {
                "delivery_total": summary.total_delivery_amount,
                "flow_total": summary.total_flow_amount,
                "platform_total": summary.total_platform_amount,
                "diff_delivery_vs_flow": summary.total_diff_delivery_vs_flow,
                "diff_delivery_vs_platform": summary.total_diff_delivery_vs_platform,
                "diff_flow_vs_platform": summary.total_diff_flow_vs_platform,
            },
            "discrepancy_summary": {
                "over_deduction_count": summary.over_deduction_count,
                "over_deduction_amount": summary.over_deduction_amount,
                "under_deduction_count": summary.under_deduction_count,
                "under_deduction_amount": summary.under_deduction_amount,
                "delivery_missing_count": summary.delivery_missing_count,
                "flow_missing_count": summary.flow_missing_count,
                "platform_missing_count": summary.platform_missing_count,
            },
            "platform_statistics": summary.platform_statistics,
            "status": summary.status,
        }
    
    def get_discrepancy_details(
        self,
        task_id: uuid.UUID,
        discrepancy_type: str = None,
        carrier: str = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """
        差异明细
        
        返回异常订单的详细信息
        """
        query = self.db.query(TripartiteReconciliation).filter(
            TripartiteReconciliation.task_id == task_id,
            TripartiteReconciliation.status != ReconciliationStatus.MATCHED.value,
        )
        
        if discrepancy_type:
            query = query.filter(TripartiteReconciliation.discrepancy_type == discrepancy_type)
        if carrier:
            query = query.filter(TripartiteReconciliation.carrier == carrier)
        
        total = query.count()
        results = query.order_by(
            TripartiteReconciliation.diff_delivery_vs_flow.desc()
        ).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        return {
            "items": [
                {
                    "order_sn": r.delivery_order_sn,
                    "carrier": r.carrier,
                    "status": r.status,
                    "discrepancy_type": r.discrepancy_type,
                    "delivery_amount": r.delivery_amount,
                    "flow_amount": r.flow_amount,
                    "platform_amount": r.platform_amount,
                    "diff_delivery_vs_flow": r.diff_delivery_vs_flow,
                    "diff_delivery_vs_platform": r.diff_delivery_vs_platform,
                    "reason": r.discrepancy_reason,
                    "order_time": r.order_time.isoformat() if r.order_time else None,
                }
                for r in results
            ],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            }
        }
    
    def get_amount_comparison(self, task_id: uuid.UUID) -> Dict[str, Any]:
        """
        金额三方对比表
        
        返回：
        - 配送单总金额
        - 流水单总金额
        - 三方账单总金额
        - 两两差异
        - 差异率
        """
        summary = self.db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task_id
        ).first()
        
        if not summary:
            return {}
        
        delivery = summary.total_delivery_amount
        flow = summary.total_flow_amount
        platform = summary.total_platform_amount
        
        # 计算差异率
        def calc_rate(base, diff):
            if base == 0:
                return 0
            return round(diff / base * 100, 2)
        
        return {
            "delivery_total": delivery,
            "flow_total": flow,
            "platform_total": platform,
            "comparison": {
                "delivery_vs_flow": {
                    "diff": summary.total_diff_delivery_vs_flow,
                    "rate": calc_rate(delivery, summary.total_diff_delivery_vs_flow),
                },
                "delivery_vs_platform": {
                    "diff": summary.total_diff_delivery_vs_platform,
                    "rate": calc_rate(delivery, summary.total_diff_delivery_vs_platform),
                },
                "flow_vs_platform": {
                    "diff": summary.total_diff_flow_vs_platform,
                    "rate": calc_rate(flow, summary.total_diff_flow_vs_platform),
                },
            }
        }
    
    def get_discrepancy_trend(
        self,
        task_id: uuid.UUID,
        granularity: str = "day",
    ) -> List[Dict[str, Any]]:
        """
        差异趋势
        
        返回指定时间粒度的差异分布
        """
        if granularity == "day":
            date_format = "%Y-%m-%d"
            date_column = func.date_format(TripartiteReconciliation.order_time, date_format)
        else:
            date_format = "%Y-%m"
            date_column = func.date_format(TripartiteReconciliation.order_time, date_format)
        
        stats = self.db.query(
            date_column.label('period'),
            func.count(TripartiteReconciliation.id).label('total'),
            func.sum(
                func.if_(TripartiteReconciliation.status == ReconciliationStatus.MATCHED.value, 1, 0)
            ).label('matched'),
            func.sum(
                func.if_(TripartiteReconciliation.status != ReconciliationStatus.MATCHED.value, 1, 0)
            ).label('discrepancy'),
            func.sum(TripartiteReconciliation.diff_delivery_vs_flow).label('total_diff'),
        ).filter(
            TripartiteReconciliation.task_id == task_id
        ).group_by('period').order_by('period').all()
        
        return [
            {
                "period": stat.period,
                "total": stat.total,
                "matched": stat.matched,
                "discrepancy": stat.discrepancy,
                "match_rate": round(stat.matched / stat.total * 100, 2) if stat.total > 0 else 0,
                "total_diff": round(stat.total_diff or 0, 2),
            }
            for stat in stats
        ]
    
    def get_platform_comparison(self, task_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        按平台对比
        
        返回各平台的配送单vs三方账单对比
        """
        stats = self.db.query(
            TripartiteReconciliation.carrier,
            func.count(TripartiteReconciliation.id).label('total'),
            func.sum(TripartiteReconciliation.delivery_amount).label('delivery_total'),
            func.sum(TripartiteReconciliation.platform_amount).label('platform_total'),
            func.sum(TripartiteReconciliation.diff_delivery_vs_platform).label('diff'),
        ).filter(
            TripartiteReconciliation.task_id == task_id
        ).group_by(TripartiteReconciliation.carrier).all()
        
        return [
            {
                "carrier": stat.carrier or "未知",
                "order_count": stat.total,
                "delivery_amount": round(stat.delivery_total or 0, 2),
                "platform_amount": round(stat.platform_total or 0, 2),
                "diff": round(stat.diff or 0, 2),
                "diff_rate": round((stat.diff or 0) / (stat.delivery_total or 1) * 100, 2),
            }
            for stat in stats
        ]


class AlertService(StatisticsService):
    """
    预警分析服务
    能力：异常检测、定时报告、趋势预警
    """
    
    def detect_anomalies(
        self,
        task_id: uuid.UUID,
        thresholds: Dict[str, float] = None,
    ) -> List[Dict[str, Any]]:
        """
        异常检测
        
        检测类型：
        - 金额异常波动
        - 匹配率骤降
        - 重复扣款
        - 数据缺失告警
        """
        if thresholds is None:
            thresholds = {
                "match_rate_low": 50.0,      # 匹配率低于50%
                "amount_diff_high": 1000.0,  # 差异金额超过1000
                "missing_rate_high": 20.0,   # 缺失率超过20%
            }
        
        anomalies = []
        
        # 1. 检查匹配率
        summary = self.db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task_id
        ).first()
        
        if summary:
            if summary.match_rate < thresholds["match_rate_low"]:
                anomalies.append({
                    "type": "LOW_MATCH_RATE",
                    "level": "HIGH" if summary.match_rate < 30 else "MEDIUM",
                    "message": f"匹配率过低: {summary.match_rate}%",
                    "detail": {
                        "match_rate": summary.match_rate,
                        "threshold": thresholds["match_rate_low"],
                    }
                })
            
            # 2. 检查差异金额
            if abs(summary.total_diff_delivery_vs_flow) > thresholds["amount_diff_high"]:
                anomalies.append({
                    "type": "HIGH_AMOUNT_DIFF",
                    "level": "HIGH",
                    "message": f"差异金额过大: ¥{summary.total_diff_delivery_vs_flow:.2f}",
                    "detail": {
                        "diff_amount": summary.total_diff_delivery_vs_flow,
                        "threshold": thresholds["amount_diff_high"],
                    }
                })
        
        # 3. 检测重复扣款 (同一订单多次扣款)
        duplicate_flows = self.db.query(
            FlowRecord.delivery_order_id,
            func.count(FlowRecord.id).label('count'),
        ).filter(
            and_(
                FlowRecord.task_id == task_id,
                FlowRecord.type == 1,  # 扣款
            )
        ).group_by(FlowRecord.delivery_order_id).having(
            func.count(FlowRecord.id) > 1
        ).all()
        
        if duplicate_flows:
            anomalies.append({
                "type": "DUPLICATE_DEDUCTION",
                "level": "HIGH",
                "message": f"发现 {len(duplicate_flows)} 笔可能重复扣款",
                "detail": {
                    "count": len(duplicate_flows),
                    "orders": [f.delivery_order_id for f in duplicate_flows[:10]],
                }
            })
        
        # 4. 检测数据缺失
        if summary:
            missing_rate = (summary.delivery_missing_count + 
                          summary.flow_missing_count + 
                          summary.platform_missing_count) / max(summary.total_orders, 1) * 100
            
            if missing_rate > thresholds["missing_rate_high"]:
                anomalies.append({
                    "type": "HIGH_MISSING_RATE",
                    "level": "MEDIUM",
                    "message": f"数据缺失率过高: {missing_rate:.1f}%",
                    "detail": {
                        "delivery_missing": summary.delivery_missing_count,
                        "flow_missing": summary.flow_missing_count,
                        "platform_missing": summary.platform_missing_count,
                    }
                })
        
        return anomalies
    
    def get_dashboard_data(self, task_id: uuid.UUID) -> Dict[str, Any]:
        """
        获取仪表盘数据
        
        返回前端仪表盘所需的所有数据
        """
        summary = self.db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task_id
        ).first()
        
        carrier_summary = DeliveryStatisticsService(self.db).get_carrier_summary(task_id)
        platform_comparison = ReconciliationStatisticsService(self.db).get_platform_comparison(task_id)
        anomalies = self.detect_anomalies(task_id)
        
        return {
            "summary": {
                "total_orders": summary.total_orders if summary else 0,
                "matched_orders": summary.matched_orders if summary else 0,
                "match_rate": summary.match_rate if summary else 0,
                "discrepancy_count": (
                    (summary.minor_discrepancy_orders or 0) +
                    (summary.major_discrepancy_orders or 0) +
                    (summary.missing_data_orders or 0)
                ) if summary else 0,
            },
            "amount_comparison": {
                "delivery": summary.total_delivery_amount if summary else 0,
                "flow": summary.total_flow_amount if summary else 0,
                "platform": summary.total_platform_amount if summary else 0,
            },
            "carrier_summary": carrier_summary,
            "platform_comparison": platform_comparison,
            "alerts": anomalies,
            "discrepancy_types": {
                "over_deduction": summary.over_deduction_count if summary else 0,
                "under_deduction": summary.under_deduction_count if summary else 0,
                "missing": summary.missing_data_orders if summary else 0,
            }
        }
