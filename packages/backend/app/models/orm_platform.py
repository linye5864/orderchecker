"""
三方账单模型 - SQLAlchemy ORM
核心字段：第三方配送平台扣聚合平台的金额记录
"""

import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, JSON, Index, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class PlatformBill(Base):
    """
    三方账单 - 第三方配送平台扣聚合平台的金额记录
    核心问题：第三方配送平台扣了聚合平台多少钱？
    
    对应源文件: data/达达账单.xlsx, 闪送账单.xlsx, 顺丰账单.xlsx 等
    关键列映射 (达达):
        - 第三方订单ID → 第三方订单号
        - 达达订单ID → 平台订单号
        - 订单状态 → 账单状态
        - 应付金额 → 扣款金额
    """
    __tablename__ = "platform_bills"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # ===== 三方平台信息 =====
    carrier = Column(String(32), index=True)            # 配送平台 (达达/闪送/顺丰/蜂鸟/UU跑腿/裹小递)
    carrier_bill_id = Column(String(64), unique=True)   # 三方账单唯一标识
    
    # ===== 订单标识 =====
    third_party_order_id = Column(String(64), index=True)  # 第三方订单ID (主键)
    platform_order_id = Column(String(64), index=True)     # 平台订单号
    order_source = Column(String(64))                   # 订单来源
    
    # ===== 商户信息 =====
    merchant_id = Column(String(64), index=True)        # 大客户ID
    merchant_name = Column(String(128))                 # 大客户名称
    store_id = Column(String(64), index=True)           # 门店ID
    store_name = Column(String(128))                    # 门店名称
    
    # ===== 地址信息 =====
    city = Column(String(32))                           # 城市
    delivery_address = Column(Text)                     # 配送地址
    
    # ===== 金额信息 (核心) =====
    order_amount = Column(Float, default=0.0)           # 订单金额
    delivery_fee = Column(Float, default=0.0)           # 配送费
    additional_fee = Column(Float, default=0.0)         # 附加费用 (距离调价/重量调价/时段调价等)
    tip = Column(Float, default=0.0)                    # 小费
    total_deduction = Column(Float, default=0.0)        # 总扣款金额 (核心)
    
    # 费用明细
    base_fee = Column(Float, default=0.0)               # 起步价
    distance_adjustment = Column(Float, default=0.0)    # 距离调价
    weight_adjustment = Column(Float, default=0.0)      # 重量调价
    time_adjustment = Column(Float, default=0.0)        # 时段调价
    weather_adjustment = Column(Float, default=0.0)     # 天气加价
    penalty = Column(Float, default=0.0)                # 违约金
    coupon = Column(Float, default=0.0)                 # 优惠券
    
    # ===== 配送信息 =====
    delivery_distance = Column(Float, default=0.0)      # 配送距离
    order_weight = Column(Float, default=0.0)           # 订单重量
    
    # ===== 状态信息 =====
    order_status = Column(String(32), index=True)       # 订单状态
    settlement_status = Column(String(32), index=True)  # 结算状态
    
    # ===== 时间信息 =====
    order_time = Column(DateTime, index=True)           # 下单时间
    pickup_time = Column(DateTime)                      # 取货时间
    delivery_time = Column(DateTime)                    # 送达时间
    cancel_time = Column(DateTime)                      # 取消时间
    settlement_time = Column(DateTime)                  # 结算时间
    
    # ===== 原始数据 =====
    raw_data = Column(JSON)                             # 原始数据备份
    
    # ===== 元数据 =====
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 索引
    __table_args__ = (
        Index('ix_platform_carrier_status', 'carrier', 'order_status'),
        Index('ix_platform_merchant_time', 'merchant_id', 'order_time'),
    )
    
    def __repr__(self):
        return f"<PlatformBill(carrier={self.carrier}, third_party_id={self.third_party_order_id}, amount={self.total_deduction})>"


class PlatformSummary(Base):
    """
    三方账单汇总 - 按平台/状态维度汇总
    """
    __tablename__ = "platform_summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), index=True)
    
    # 汇总维度
    carrier = Column(String(32), index=True)            # 配送平台
    order_status = Column(String(32), index=True)       # 订单状态
    
    # 统计指标
    order_count = Column(Integer, default=0)            # 订单数量
    total_amount = Column(Float, default=0.0)           # 总扣款金额
    avg_amount = Column(Float, default=0.0)             # 平均扣款金额
    
    # 费用明细汇总
    total_delivery_fee = Column(Float, default=0.0)     # 总配送费
    total_additional_fee = Column(Float, default=0.0)   # 总附加费
    total_penalty = Column(Float, default=0.0)          # 总违约金
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<PlatformSummary(carrier={self.carrier}, count={self.order_count}, amount={self.total_amount})>"
