"""
流水单模型 - SQLAlchemy ORM
核心字段：聚合平台扣除商户的记录
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class FlowRecord(Base):
    """
    流水单 - 聚合平台扣除商户的记录
    核心问题：聚合平台实际扣了商户多少钱？
    
    对应源文件: data/流水账单.xlsx
    关键列映射:
        - admin_id → 商户ID
        - money → 金额 (负数为扣款)
        - delivery_order_id → 关联订单号
        - createtime → 交易时间
    """
    __tablename__ = "flow_records"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # ===== 商户信息 =====
    admin_id = Column(String(64), index=True)           # 商户ID
    order_sn = Column(String(64), index=True)           # 订单号
    
    # ===== 金额信息 =====
    money = Column(Float, default=0.0)                  # 金额 (负数为扣款)
    before = Column(Float, default=0.0)                 # 变动前余额
    after = Column(Float, default=0.0)                  # 变动后余额
    
    # ===== 订单关联 =====
    order_id = Column(String(64), index=True)           # 流水单号
    delivery_order_id = Column(String(64), index=True)  # 关联配送订单号
    
    # ===== 交易类型 =====
    # type: 1=支出/扣款, 2=收入
    # method: 1=余额支付, 2=线上支付, 3=新客奖励
    type = Column(Integer, index=True)                  # 类型 (1=支出, 2=收入)
    method = Column(Integer, index=True)                # 方式
    
    # ===== 备注 =====
    memo = Column(Text)                                 # 备注
    
    # ===== 时间信息 =====
    createtime = Column(DateTime, index=True)           # 交易时间
    
    # ===== 原始数据 =====
    raw_data = Column(JSON)                             # 原始数据备份
    
    # ===== 元数据 =====
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 索引
    __table_args__ = (
        Index('ix_flow_admin_time', 'admin_id', 'createtime'),
        Index('ix_flow_type_method', 'type', 'method'),
    )
    
    def __repr__(self):
        return f"<FlowRecord(admin_id={self.admin_id}, money={self.money}, delivery_order_id={self.delivery_order_id})>"
    
    @property
    def is_deduction(self) -> bool:
        """是否为扣款"""
        return self.type == 1 and self.money < 0
    
    @property
    def deduction_amount(self) -> float:
        """获取扣款金额（正数）"""
        return abs(self.money) if self.is_deduction else 0.0


class MerchantSummary(Base):
    """
    商户流水汇总 - 以商户为中心的账户流水统计
    """
    __tablename__ = "merchant_summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # 商户信息
    admin_id = Column(String(64), index=True)           # 商户ID
    
    # 账户统计
    total_deductions = Column(Integer, default=0)       # 扣款笔数
    total_deduction_amount = Column(Float, default=0.0) # 扣款总金额
    avg_deduction_amount = Column(Float, default=0.0)   # 平均扣款金额
    
    # 收入统计
    total_recharges = Column(Integer, default=0)        # 充值笔数
    total_recharge_amount = Column(Float, default=0.0)  # 充值总金额
    new_customer_reward = Column(Float, default=0.0)    # 新客奖励
    
    # 余额变动
    balance_before = Column(Float, default=0.0)         # 期初余额
    balance_after = Column(Float, default=0.0)          # 期末余额
    
    # 扣款类型分布
    delivery_fee_count = Column(Integer, default=0)     # 配送费扣款
    cancel_fee_count = Column(Integer, default=0)       # 取消扣款
    complaint_fee_count = Column(Integer, default=0)    # 投诉扣款
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<MerchantSummary(admin_id={self.admin_id}, deductions={self.total_deductions}, amount={self.total_deduction_amount})>"
