"""
三方对账结果模型 - SQLAlchemy ORM
核心：配送单(应该扣) vs 流水单(实际扣) vs 三方账单(三方扣)
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, Index, Boolean
from app.core.database import Base
from app.core.guid import GUID


class ReconciliationStatus(PyEnum):
    """对账状态枚举"""
    MATCHED = "MATCHED"           # 三方金额一致
    MINOR_DISCREPANCY = "MINOR"   # 小额差异
    MAJOR_DISCREPANCY = "MAJOR"   # 重大差异
    MISSING_DATA = "MISSING"      # 数据缺失


class DiscrepancyType(PyEnum):
    """差异类型枚举"""
    NONE = "NONE"                         # 无差异
    OVER_DEDUCTION = "OVER"               # 多扣款
    UNDER_DEDUCTION = "UNDER"             # 少扣款
    DELIVERY_MISSING = "DELIVERY_MISSING"     # 配送单缺失
    FLOW_MISSING = "FLOW_MISSING"             # 流水单缺失
    PLATFORM_MISSING = "PLATFORM_MISSING"     # 三方账单缺失
    AMOUNT_MISMATCH = "AMOUNT_MISMATCH"       # 金额不匹配
    STATUS_MISMATCH = "STATUS_MISMATCH"       # 订单状态异常


class TripartiteReconciliation(Base):
    """
    三方对账结果 - 同时比较配送单、流水单、三方账单
    
    对账规则：
    1. 以商户订单号(delivery_order_sn)为主键进行关联
    2. 同时匹配三方运力订单号(third_party_order_id)作为辅助
    3. 比较三个金额：
       - delivery_amount: 配送单记录的平台扣款
       - flow_amount: 流水单记录的商户扣款
       - platform_amount: 三方账单记录的三方扣款
    """
    __tablename__ = "tripartite_reconciliations"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    task_id = Column(GUID(), index=True)
    
    # ===== 订单关联 (关键关联字段) =====
    delivery_order_sn = Column(String(64), index=True)      # 配送单号 (主键)
    platform_order_id = Column(String(64), index=True)      # 平台订单号
    third_party_order_id = Column(String(64), index=True)   # 三方运力订单号
    
    # ===== 商户信息 =====
    merchant_id = Column(String(64), index=True)            # 商户ID
    admin_id = Column(String(64), index=True)               # 管理员ID
    
    # ===== 配送平台 =====
    carrier = Column(String(32), index=True)                # 配送平台
    
    # ===== 三方金额对比 (核心) =====
    delivery_amount = Column(Float, default=0.0)     # 配送单金额（应该扣）
    flow_amount = Column(Float, default=0.0)         # 流水单金额（实际扣）
    platform_amount = Column(Float, default=0.0)     # 三方账单金额（三方扣）
    
    # ===== 差异计算 =====
    diff_delivery_vs_flow = Column(Float, default=0.0)     # 配送单 vs 流水单
    diff_delivery_vs_platform = Column(Float, default=0.0) # 配送单 vs 三方
    diff_flow_vs_platform = Column(Float, default=0.0)     # 流水单 vs 三方
    
    # ===== 对账结果 =====
    status = Column(String(32), default=ReconciliationStatus.MATCHED.value, index=True)
    discrepancy_type = Column(String(32), default=DiscrepancyType.NONE.value, index=True)
    
    # ===== 差异原因 =====
    discrepancy_reason = Column(Text)                       # 差异原因说明
    raw_discrepancy_reason = Column(Text)                   # 原始差异原因
    
    # ===== 数据缺失标记 =====
    has_delivery_data = Column(Boolean, default=True)       # 是否有配送单数据
    has_flow_data = Column(Boolean, default=True)           # 是否有流水单数据
    has_platform_data = Column(Boolean, default=True)       # 是否有三方账单数据
    
    # ===== 金额异常标记 =====
    is_over_deduction = Column(Boolean, default=False)      # 是否多扣款
    is_under_deduction = Column(Boolean, default=False)     # 是否少扣款
    is_amount_mismatch = Column(Boolean, default=False)     # 是否金额不匹配
    
    # ===== 配送状态 =====
    delivery_status = Column(String(32))                    # 配送状态
    platform_order_status = Column(String(32))              # 三方订单状态
    
    # ===== 时间信息 =====
    order_time = Column(DateTime, index=True)               # 订单时间
    
    # ===== 元数据 =====
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 索引
    __table_args__ = (
        Index('ix_recon_carrier_status', 'carrier', 'status'),
        Index('ix_recon_admin_time', 'admin_id', 'order_time'),
        Index('ix_recon_discrepancy_type', 'discrepancy_type'),
        Index('ix_recon_merchant_task', 'merchant_id', 'task_id'),
        Index('ix_recon_carrier_task', 'carrier', 'task_id'),
        Index('ix_recon_merchant_status', 'merchant_id', 'status'),
    )
    
    def __repr__(self):
        return f"<TripartiteReconciliation(order={self.delivery_order_sn}, status={self.status}, diff={self.diff_delivery_vs_flow})>"
    
    @property
    def is_matched(self) -> bool:
        """是否完全匹配"""
        return self.status == ReconciliationStatus.MATCHED.value
    
    @property
    def total_discrepancy(self) -> float:
        """总差异金额"""
        return abs(self.diff_delivery_vs_flow) + abs(self.diff_delivery_vs_platform) + abs(self.diff_flow_vs_platform)


class ReconciliationSummary(Base):
    """
    对账汇总统计 - 任务级别的汇总信息
    """
    __tablename__ = "reconciliation_summaries"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    task_id = Column(GUID(), unique=True, index=True)
    
    # ===== 基础统计 =====
    total_orders = Column(Integer, default=0)              # 总订单数
    matched_orders = Column(Integer, default=0)            # 匹配成功数
    minor_discrepancy_orders = Column(Integer, default=0)  # 小额差异数
    major_discrepancy_orders = Column(Integer, default=0)  # 重大差异数
    missing_data_orders = Column(Integer, default=0)       # 数据缺失数
    
    # ===== 匹配率 =====
    match_rate = Column(Float, default=0.0)                # 匹配率 (%)
    discrepancy_rate = Column(Float, default=0.0)          # 差异率 (%)
    
    # ===== 金额汇总 =====
    total_delivery_amount = Column(Float, default=0.0)     # 配送单总金额
    total_flow_amount = Column(Float, default=0.0)         # 流水单总金额
    total_platform_amount = Column(Float, default=0.0)     # 三方账单总金额
    
    # ===== 差异汇总 =====
    total_diff_delivery_vs_flow = Column(Float, default=0.0)   # 配送单vs流水单总差异
    total_diff_delivery_vs_platform = Column(Float, default=0.0)  # 配送单vs三方总差异
    total_diff_flow_vs_platform = Column(Float, default=0.0)     # 流水单vs三方总差异
    
    # ===== 差异分类统计 =====
    over_deduction_count = Column(Integer, default=0)      # 多扣款笔数
    over_deduction_amount = Column(Float, default=0.0)     # 多扣款金额
    under_deduction_count = Column(Integer, default=0)     # 少扣款笔数
    under_deduction_amount = Column(Float, default=0.0)    # 少扣款金额
    
    # ===== 数据缺失统计 =====
    delivery_missing_count = Column(Integer, default=0)    # 配送单缺失数
    flow_missing_count = Column(Integer, default=0)        # 流水单缺失数
    platform_missing_count = Column(Integer, default=0)    # 三方账单缺失数
    
    # ===== 按平台统计 =====
    platform_statistics = Column(JSON)                     # 按平台统计
    
    # ===== 状态 =====
    status = Column(String(32), default="PENDING")         # 汇总状态
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<ReconciliationSummary(task_id={self.task_id}, matched={self.matched_orders}/{self.total_orders}, rate={self.match_rate}%)>"
