"""
配送单模型 - SQLAlchemy ORM
核心字段：聚合平台调用三方配送平台的资金记录
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class DeliveryOrder(Base):
    """
    配送单 - 聚合平台调用三方配送平台的资金记录
    核心问题：这笔订单应该扣商户多少钱？
    
    对应源文件: data/配送单.xlsx
    关键列映射:
        - delivery_order_sn → 订单号
        - 发单运力 → 配送平台
        - 配送状态 → 配送状态
        - free → 扣款金额
    """
    __tablename__ = "delivery_orders"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # ===== 订单标识 =====
    order_sn = Column(String(64), index=True)           # 系统订单号
    delivery_order_sn = Column(String(64), index=True)  # 配送单号（主键）
    platform_order_id = Column(String(64), index=True)  # 聚合平台订单号
    delivery_id = Column(String(64), index=True)        # 配送ID
    
    # ===== 配送信息 =====
    carrier = Column(String(32), index=True)            # 配送平台 (达达/闪送/顺丰/蜂鸟/UU跑腿/裹小递)
    delivery_channel = Column(Integer)                  # 配送渠道 (0=第三方, 1=自配送)
    delivery_status = Column(String(32), index=True)    # 配送状态 (配送完成/配送中/已取消/配送平台取消)
    courier_name = Column(String(32))                   # 骑手姓名
    courier_phone = Column(String(32))                  # 骑手电话
    
    # ===== 金额信息 =====
    free = Column(Float, default=0.0)                   # 扣款金额
    initial_fee = Column(Float, default=0.0)            # 初始配送费
    discount = Column(Float, default=0.0)               # 优惠金额
    real_fee = Column(Float, default=0.0)               # 实际配送费
    other_fee = Column(Float, default=0.0)              # 其他费用
    
    # ===== 商户信息 =====
    merchant_id = Column(String(64), index=True)        # 商户ID
    admin_id = Column(String(64), index=True)           # 管理员ID
    store_id = Column(String(64), index=True)           # 门店ID
    
    # ===== 地址信息 =====
    from_address = Column(Text)                         # 出发地址
    to_address = Column(Text)                           # 目的地址
    
    # ===== 时间信息 =====
    start_time = Column(DateTime, index=True)           # 开始时间
    create_time = Column(DateTime, index=True)          # 创建时间
    
    # ===== 原始数据 =====
    raw_data = Column(JSON)                             # 原始数据备份
    
    # ===== 元数据 =====
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 索引
    __table_args__ = (
        Index('ix_delivery_carrier_status', 'carrier', 'delivery_status'),
        Index('ix_delivery_admin_time', 'admin_id', 'create_time'),
    )
    
    def __repr__(self):
        return f"<DeliveryOrder(order_sn={self.delivery_order_sn}, carrier={self.carrier}, free={self.free})>"


class DeliverySummary(Base):
    """
    配送单汇总统计 - 按平台/状态/商户维度汇总
    用于快速查询统计结果
    """
    __tablename__ = "delivery_summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # 汇总维度
    carrier = Column(String(32), index=True)            # 配送平台
    delivery_status = Column(String(32), index=True)    # 配送状态
    admin_id = Column(String(64), index=True)           # 商户ID
    
    # 统计指标
    order_count = Column(Integer, default=0)            # 订单数量
    total_amount = Column(Float, default=0.0)           # 总扣款金额
    avg_amount = Column(Float, default=0.0)             # 平均扣款金额
    
    # 状态分布
    completed_count = Column(Integer, default=0)        # 已完成数量
    cancelled_count = Column(Integer, default=0)        # 已取消数量
    in_progress_count = Column(Integer, default=0)      # 进行中数量
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<DeliverySummary(carrier={self.carrier}, count={self.order_count}, amount={self.total_amount})>"
