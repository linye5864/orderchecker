"""
三方对账引擎 - 核心业务逻辑
同时比较：配送单(应该扣) vs 流水单(实际扣) vs 三方账单(三方扣)
"""

import uuid
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
from decimal import Decimal
import pandas as pd

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.models.orm_delivery import DeliveryOrder, DeliverySummary
from app.models.orm_flow import FlowRecord, MerchantSummary
from app.models.orm_platform import PlatformBill, PlatformSummary
from app.models.orm_reconciliation import (
    TripartiteReconciliation,
    ReconciliationSummary,
    ReconciliationStatus,
    DiscrepancyType,
)


class TripartiteReconciliationEngine:
    """
    三方对账引擎
    
    核心对账逻辑：
    1. 配送单(应该扣)：聚合平台调用三方配送平台的资金记录
    2. 流水单(实际扣)：聚合平台扣除商户的记录
    3. 三方账单(三方扣)：第三方配送平台扣聚合平台的金额记录
    
    对账规则：
    - 以商户订单号(delivery_order_sn)为主键进行关联
    - 同时匹配三方运力订单号(third_party_order_id)作为辅助
    - 比较三个金额是否一致
    """
    
    # 金额容差（分）
    AMOUNT_TOLERANCE = 0.01
    
    # 承运商代码映射 (英文 -> 中文)
    CARRIER_MAP = {
        "dada": "达达",
        "sf": "顺丰",
        "sf_enterprise": "顺丰",
        "hh": "蜂鸟",
        "uu": "UU跑腿",
        "ss": "闪送",
        "gxd": "裹小递",
    }
    
    def __init__(self, db: Session, task_id: uuid.UUID):
        self.db = db
        self.task_id = task_id
        self.callback = None
        self.flow_records = []  # Store parsed flow records for persistence
    
    def set_callback(self, callback):
        """设置进度回调"""
        self.callback = callback
    
    def _progress(self, message: str, progress: float = None):
        """更新进度"""
        if self.callback:
            self.callback(message, progress)
        print(f"[{self.task_id}] {message}")
    
    def perform_reconciliation(
        self,
        delivery_file_path: str = None,
        flow_file_path: str = None,
        platform_files: Dict[str, str] = None,
    ) -> ReconciliationSummary:
        """
        执行三方对账
        
        Args:
            delivery_file_path: 配送单文件路径
            flow_file_path: 流水单文件路径
            platform_files: 三方账单文件路径字典 {carrier: file_path}
        
        Returns:
            对账汇总结果
        """
        self._progress("开始三方对账...", 0)
        
        # Step 1: 解析配送单
        self._progress("解析配送单文件...", 10)
        delivery_orders = self._parse_delivery_orders(delivery_file_path)
        self._progress(f"解析配送单完成，共 {len(delivery_orders)} 条", 15)
        
        # Step 2: 解析流水单
        self._progress("解析流水单文件...", 20)
        flow_records = self._parse_flow_records(flow_file_path)
        self.flow_records = flow_records  # Store for later saving
        self._progress(f"解析流水单完成，共 {len(flow_records)} 条", 25)
        
        # Step 3: 解析三方账单
        self._progress("解析三方账单文件...", 30)
        platform_bills = self._parse_platform_bills(platform_files or {})
        self._progress(f"解析三方账单完成，共 {len(platform_bills)} 条", 35)
        
        # Step 4: 构建索引
        self._progress("构建数据索引...", 40)
        delivery_index = self._build_delivery_index(delivery_orders)
        flow_index = self._build_flow_index(flow_records)
        platform_index = self._build_platform_index(platform_bills)
        print(f"[RECON] 索引构建完成: Delivery={len(delivery_index)}, Flow={len(flow_index)}, Platform={len(platform_index)}")
        
        # Step 5: 三方匹配
        self._progress("执行三方对账匹配...", 50)
        results = self._tripartite_match(delivery_index, flow_index, platform_index)
        print(f"[RECON] 匹配逻辑执行完成, 产出结果行数: {len(results)}")
        self._progress(f"对账匹配完成，共 {len(results)} 条结果", 70)
        
        # Step 6: 生成汇总
        self._progress("生成对账汇总...", 80)
        summary = self._generate_summary(results, delivery_orders, flow_records, platform_bills)
        
        # Step 7: 保存结果
        self._progress("保存对账结果...", 90)
        print(f"DEBUG: Summary prepared. Total orders: {summary.total_orders}, Matched: {summary.matched_orders}")
        self._save_results(results, summary)
        
        self._progress("对账完成!", 100)
        return summary
    
    def _parse_delivery_orders(self, file_path: str) -> List[DeliveryOrder]:
        """解析配送单文件 (宽容模式：不过滤状态)"""
        df = self._read_data_file(file_path)
        if df.empty:
            return []
        
        try:
            orders = []
            delivery_data = df.to_dict('records')
            total_rows = len(delivery_data)
            print(f"[PARSE] 配送单原始行数: {total_rows}")
            
            for row in delivery_data:
                # 获取各个可能的订单号字段
                delivery_order_sn = (
                    self._safe_get(row, 'delivery_order_sn') or 
                    self._safe_get(row, '三方单号') or 
                    self._safe_get(row, '配送单号') or
                    self._safe_get(row, '订单号')
                )
                
                # 只要有单号，就认为是有效订单
                if not delivery_order_sn:
                    continue
                    
                # 不再根据状态过滤！
                # delivery_status = self._safe_get(row, '配送状态')
                # if delivery_status not in ['配送完成', '已完成', 'SUCCESS']: continue
                
                merchant_id = self._safe_get(row, 'merchant_id') or self._safe_get(row, '商户ID')
                admin_id = self._safe_get(row, 'admin_id') or self._safe_get(row, '管理员ID') or merchant_id
                
                # 金额处理：优先找 '真实配送费', 其次 '配送费'
                delivery_amount = (
                    self._safe_float(row, 'real_fee') or 
                    self._safe_float(row, '真实配送费') or
                    self._safe_float(row, 'delivery_fee') or 
                    self._safe_float(row, '配送费') or
                    self._safe_float(row, '消耗金额')
                )
                
                order = DeliveryOrder(
                    task_id=self.task_id,
                    delivery_order_sn=delivery_order_sn,
                    platform_order_id=self._safe_get(row, 'platform_order_id'),
                    free=delivery_amount,  # 扣款金额 (模型字段名为 free)
                    delivery_status=self._safe_get(row, '配送状态'), # 记录状态但不以此过滤
                    courier_name=self._safe_get(row, 'courier_name'),
                    courier_phone=self._safe_get(row, 'courier_phone'),
                    merchant_id=merchant_id,
                    admin_id=admin_id,
                    start_time=self._safe_datetime(row, 'start_time'),
                    create_time=self._safe_datetime(row, 'create_time') or self._safe_datetime(row, '创建时间'),
                    raw_data=row,
                )
                orders.append(order)
            
            print(f"[PARSE] 配送单有效解析数: {len(orders)}")
            if len(orders) == 0:
                raise ValueError(f"虽然读取了 {total_rows} 行，但未能提取出任何有效订单！请检查表头是否包含 '三方单号'/'配送单号'/'订单号'。")
                
            return orders
        except Exception as e:
            self._progress(f"解析配送单失败: {str(e)}")
            # 关键：抛出异常，让主流程感知到失败
            raise 
    
    def _parse_flow_records(self, file_path: str) -> List[FlowRecord]:
        """解析流水单文件 (优化版)"""
        df = self._read_data_file(file_path)
        if df.empty:
            return []
        
        try:
            records = []
            flow_data = df.to_dict('records')
            for row in flow_data:
                # 智能识别流水字段
                money = self._safe_float(row, 'money') or self._safe_float(row, '金额') or self._safe_float(row, '发生金额') or self._safe_float(row, '变动金额')
                order_sn = (
                    self._safe_get(row, 'order_sn') or 
                    self._safe_get(row, '流水号') or 
                    self._safe_get(row, '交易流水号') or
                    self._safe_get(row, '账单单号')
                )
                delivery_order_id = (
                    self._safe_get(row, 'delivery_order_id') or 
                    self._safe_get(row, '关联单号') or 
                    self._safe_get(row, '配送单号') or
                    self._safe_get(row, '三方单号') or
                    self._safe_get(row, '订单号') or
                    self._safe_get(row, '订单编号')
                )
                
                # 尝试识别类型 (如果是扣款金额通常为负)
                rtype = self._safe_int(row, 'type', 1 if money < 0 else 2)
                
                record = FlowRecord(
                    task_id=self.task_id,
                    admin_id=self._safe_get(row, 'admin_id') or self._safe_get(row, '商户ID'),
                    order_sn=order_sn,
                    money=money,
                    before=self._safe_float(row, 'before') or self._safe_float(row, '变动前额'),
                    after=self._safe_float(row, 'after') or self._safe_float(row, '变动后额'),
                    order_id=order_sn,
                    delivery_order_id=delivery_order_id,
                    type=rtype,
                    method=self._safe_int(row, 'method', 1),
                    memo=self._safe_get(row, 'memo') or self._safe_get(row, '备注'),
                    createtime=self._safe_datetime(row, 'createtime') or self._safe_datetime(row, '交易时间'),
                    raw_data=row,
                )
                records.append(record)
            
            return records
        except Exception as e:
            self._progress(f"解析流水单失败: {str(e)}")
            return []
    
    def _parse_platform_bills(self, platform_files: Dict[str, str]) -> List[PlatformBill]:
        """解析三方账单文件"""
        bills = []
        
        for carrier, file_path in platform_files.items():
            df = self._read_data_file(file_path)
            if df.empty:
                continue
            
            try:
                
                for _, row in df.iterrows():
                    bill = PlatformBill(
                        task_id=self.task_id,
                        carrier=carrier,
                        carrier_bill_id=self._generate_carrier_bill_id(carrier, row),
                        third_party_order_id=self._safe_get_third_party_id(row, carrier),
                        platform_order_id=self._safe_get_platform_id(row, carrier),
                        order_source=self._safe_get(row, '订单来源编号'),
                        merchant_id=self._safe_get(row, '大客户ID'),
                        merchant_name=self._safe_get(row, '大客户名称'),
                        store_id=self._safe_get(row, '门店ID'),
                        store_name=self._safe_get(row, '门店名称'),
                        city=self._safe_get(row, '城市'),
                        delivery_address=self._safe_get(row, '收货地址'),
                        order_amount=self._safe_float(row, '订单金额'),
                        delivery_fee=self._safe_float(row, '配送费'),
                        tip=self._safe_float(row, '配送费-小费'),
                        total_deduction=self._safe_float(row, '应付金额'),
                        delivery_distance=self._safe_float(row, '配送距离'),
                        order_weight=self._safe_float(row, '订单重量'),
                        order_status=self._safe_get(row, '订单状态'),
                        order_time=self._safe_datetime(row, '发单时间'),
                        pickup_time=self._safe_datetime(row, '取货时间'),
                        delivery_time=self._safe_datetime(row, '完成时间'),
                        cancel_time=self._safe_datetime(row, '取消时间'),
                        raw_data=row.to_dict(),
                    )
                    bills.append(bill)
            
            except Exception as e:
                self._progress(f"解析{carrier}账单失败: {str(e)}")
        
        return bills
    
    def _build_delivery_index(self, orders: List[DeliveryOrder]) -> Dict[str, DeliveryOrder]:
        """构建配送单索引"""
        return {order.delivery_order_sn: order for order in orders if order.delivery_order_sn}
    
    def _build_flow_index(self, records: List[FlowRecord]) -> Dict[str, List[FlowRecord]]:
        """构建流水单索引 (一个订单可能有多条流水)"""
        index = {}
        for record in records:
            if record.delivery_order_id:
                if record.delivery_order_id not in index:
                    index[record.delivery_order_id] = []
                index[record.delivery_order_id].append(record)
        return index
    
    def _build_platform_index(self, bills: List[PlatformBill]) -> Dict[str, PlatformBill]:
        """构建三方账单索引"""
        return {bill.third_party_order_id: bill for bill in bills if bill.third_party_order_id}
    
    def _tripartite_match(
        self,
        delivery_index: Dict[str, DeliveryOrder],
        flow_index: Dict[str, List[FlowRecord]],
        platform_index: Dict[str, PlatformBill],
    ) -> List[TripartiteReconciliation]:
        """执行三方匹配"""
        results = []
        all_keys = set(delivery_index.keys()) | set(flow_index.keys()) | set(platform_index.keys())
        
        matched_keys = set()
        total = len(all_keys)
        
        for i, key in enumerate(all_keys):
            if i % 1000 == 0:
                self._progress(f"匹配中... {i}/{total}", 50 + (i / total) * 20)
            
            delivery = delivery_index.get(key)
            flow_list = flow_index.get(key, [])
            platform = platform_index.get(key)
            
            # 获取流水单金额（可能多条记录）
            flow_amount = sum(r.deduction_amount for r in flow_list)
            
            result = self._compare_tripartite(key, delivery, flow_amount, platform)
            results.append(result)
            
            if key:
                matched_keys.add(key)
        
        return results
    
    def _compare_tripartite(
        self,
        key: str,
        delivery: Optional[DeliveryOrder],
        flow_amount: float,
        platform: Optional[PlatformBill],
    ) -> TripartiteReconciliation:
        """三方金额比较"""
        
        # 获取核心金额
        delivery_amount = delivery.free if delivery else 0
        platform_amount = platform.total_deduction if platform else 0
        
        # 计算差异
        diff_1v2 = delivery_amount - flow_amount      # 配送单 vs 流水单
        diff_1v3 = delivery_amount - platform_amount  # 配送单 vs 三方
        diff_2v3 = flow_amount - platform_amount      # 流水单 vs 三方
        
        # 判断状态
        status, discrepancy_type, reason = self._determine_status(
            delivery, flow_amount, platform,
            diff_1v2, diff_1v3, diff_2v3
        )
        
        return TripartiteReconciliation(
            task_id=self.task_id,
            delivery_order_sn=key,
            platform_order_id=delivery.platform_order_id if delivery else None,
            third_party_order_id=platform.third_party_order_id if platform else None,
            merchant_id=delivery.merchant_id if delivery else None,
            admin_id=delivery.admin_id if delivery else None,
            carrier=delivery.carrier if delivery else None,
            delivery_amount=delivery_amount,
            flow_amount=flow_amount,
            platform_amount=platform_amount,
            diff_delivery_vs_flow=diff_1v2,
            diff_delivery_vs_platform=diff_1v3,
            diff_flow_vs_platform=diff_2v3,
            status=status,
            discrepancy_type=discrepancy_type,
            discrepancy_reason=reason,
            has_delivery_data=delivery is not None,
            has_flow_data=flow_amount > 0,
            has_platform_data=platform is not None,
            is_over_deduction=diff_1v2 < -self.AMOUNT_TOLERANCE or diff_1v3 < -self.AMOUNT_TOLERANCE,
            is_under_deduction=diff_1v2 > self.AMOUNT_TOLERANCE or diff_1v3 > self.AMOUNT_TOLERANCE,
            is_amount_mismatch=abs(diff_1v2) > self.AMOUNT_TOLERANCE or abs(diff_1v3) > self.AMOUNT_TOLERANCE,
            delivery_status=delivery.delivery_status if delivery else None,
            platform_order_status=platform.order_status if platform else None,
            order_time=delivery.create_time if delivery else None,
        )
    
    def _determine_status(
        self,
        delivery: Optional[DeliveryOrder],
        flow_amount: float,
        platform: Optional[PlatformBill],
        diff_1v2: float, diff_1v3: float, diff_2v3: float,
    ) -> Tuple[str, str, str]:
        """确定对账状态和差异类型"""
        
        # 1. 完全匹配
        if all(abs(d) <= self.AMOUNT_TOLERANCE for d in [diff_1v2, diff_1v3, diff_2v3]):
            return (
                ReconciliationStatus.MATCHED.value,
                DiscrepancyType.NONE.value,
                "三方金额一致，对账成功"
            )
        
        # 2. 数据缺失
        missing_count = sum([delivery is None, flow_amount == 0, platform is None])
        if missing_count >= 2:
            if delivery is None:
                return (
                    ReconciliationStatus.MISSING_DATA.value,
                    DiscrepancyType.DELIVERY_MISSING.value,
                    "配送单缺失"
                )
            elif flow_amount == 0:
                return (
                    ReconciliationStatus.MISSING_DATA.value,
                    DiscrepancyType.FLOW_MISSING.value,
                    "流水单缺失"
                )
            else:
                return (
                    ReconciliationStatus.MISSING_DATA.value,
                    DiscrepancyType.PLATFORM_MISSING.value,
                    "三方账单缺失"
                )
        
        # 3. 核心财务风险识别 (预警逻辑)
        delivery_status = (delivery.delivery_status or "") if delivery else ""
        platform_status = (platform.order_status or "") if platform else ""
        platform_amount = platform.total_deduction if platform else 0
        
        # 异常场景 A: 已取消但扣费
        if "取消" in delivery_status or "取消" in platform_status:
            if flow_amount > 0 or platform_amount > 0:
                return (
                    ReconciliationStatus.MAJOR_DISCREPANCY.value,
                    DiscrepancyType.STATUS_MISMATCH.value,
                    f"风险：订单已取消但产生费用 (流水:¥{flow_amount}, 三方:¥{platform_amount})"
                )
        
        # 异常场景 B: 未完成产生外部成本
        if delivery_status and "配送完成" not in delivery_status and platform_amount > 0:
             return (
                    ReconciliationStatus.MAJOR_DISCREPANCY.value,
                    DiscrepancyType.STATUS_MISMATCH.value,
                    f"风险：订单未完成但三方扣款 (当前状态:{delivery_status}, 三方:¥{platform_amount})"
                )

        # 4. 纯金额差异分析
        reasons = []
        
        # 配送单 vs 流水单
        if abs(diff_1v2) > self.AMOUNT_TOLERANCE:
            if diff_1v2 > 0:
                reasons.append(f"应扣 ¥{diff_1v2:.2f}，流水少扣")
            else:
                reasons.append(f"应扣 ¥{-diff_1v2:.2f}，流水多扣")
        
        # 配送单 vs 三方
        if abs(diff_1v3) > self.AMOUNT_TOLERANCE:
             if diff_1v3 > 0:
                reasons.append(f"应扣 ¥{diff_1v3:.2f}，三方少扣")
             else:
                reasons.append(f"应扣 ¥{-diff_1v3:.2f}，三方多扣")
        
        # 判断差异性质
        total_abs_diff = abs(diff_1v2) + abs(diff_1v3)
        
        if total_abs_diff <= 10:  # 小额差异
            return (
                ReconciliationStatus.MINOR_DISCREPANCY.value,
                DiscrepancyType.AMOUNT_MISMATCH.value,
                f"小额差异: {'; '.join(reasons)}"
            )
        else:
            return (
                ReconciliationStatus.MAJOR_DISCREPANCY.value,
                DiscrepancyType.AMOUNT_MISMATCH.value,
                f"重大差异: {'; '.join(reasons)}"
            )
    
    def _generate_summary(
        self,
        results: List[TripartiteReconciliation],
        delivery_orders: List[DeliveryOrder],
        flow_records: List[FlowRecord],
        platform_bills: List[PlatformBill],
    ) -> ReconciliationSummary:
        """生成对账汇总 (基于所有发现的订单)"""
        
        # 优化：不再仅限于“配送完成”，因为有些文件的状态描述各异
        # 我们把所有有配送单数据或者只有三方数据的记录都视为“应参与对账”的单据
        valid_results = results 
        
        matched = sum(1 for r in valid_results if r.status == ReconciliationStatus.MATCHED.value)
        minor = sum(1 for r in valid_results if r.status == ReconciliationStatus.MINOR_DISCREPANCY.value)
        major = sum(1 for r in valid_results if r.status == ReconciliationStatus.MAJOR_DISCREPANCY.value)
        missing = sum(1 for r in valid_results if r.status == ReconciliationStatus.MISSING_DATA.value)
        total = len(valid_results)
        
        # 金额汇总
        total_delivery = sum(r.delivery_amount for r in valid_results)
        total_flow = sum(r.flow_amount for r in valid_results)
        total_platform = sum(r.platform_amount for r in valid_results)
        
        # 按平台统计 (仅限配送成功的)
        platform_stats = {}
        for r in valid_results:
            carrier = r.carrier or "未知"
            # 过滤掉美团跑腿，如果它是默认零值
            if carrier == "美团跑腿" and r.delivery_amount == 0 and not r.has_platform_data:
                continue
                
            if carrier not in platform_stats:
                platform_stats[carrier] = {
                    "carrier": carrier,
                    "total_orders": 0,
                    "matched_orders": 0,
                    "total_amount": 0,
                    "match_rate": 0,
                }
            platform_stats[carrier]["total_orders"] += 1
            if r.status == ReconciliationStatus.MATCHED.value:
                platform_stats[carrier]["matched_orders"] += 1
            platform_stats[carrier]["total_amount"] += r.delivery_amount
        
        for stats in platform_stats.values():
            if stats["total_orders"] > 0:
                stats["match_rate"] = round(stats["matched_orders"] / stats["total_orders"] * 100, 2)
        
        return ReconciliationSummary(
            task_id=self.task_id,
            total_orders=total,
            matched_orders=matched,
            minor_discrepancy_orders=minor,
            major_discrepancy_orders=major,
            missing_data_orders=missing,
            match_rate=round(matched / total * 100, 2) if total > 0 else 0,
            total_delivery_amount=round(total_delivery, 2),
            total_flow_amount=round(total_flow, 2),
            total_platform_amount=round(total_platform, 2),
            platform_statistics=platform_stats,
            status="COMPLETED",
        )
    
    def _save_results(
        self,
        results: List[TripartiteReconciliation],
        summary: ReconciliationSummary,
    ):
        """保存对账结果（增强版：分段 flush 和详细日志）"""
        try:
            print(f"[SAVE] 开始保存对账结果: {len(results)} 条明细, Summary.total={summary.total_orders}")
            
            # 1. 批量保存对账明细
            self._progress("保存对账明细...", 92)
            if len(results) > 0:
                self.db.add_all(results)
                self.db.flush()  # 关键：提前 flush 检测约束错误
                print(f"[SAVE] 对账明细 flush 成功: {len(results)} 条")
            else:
                print("[SAVE] 警告：对账结果为空！")
            
            # 2. 批量保存流水单记录
            if self.flow_records:
                self._progress("同步原始流水记录...", 94)
                self.db.add_all(self.flow_records)
                self.db.flush()
                print(f"[SAVE] 流水记录 flush 成功: {len(self.flow_records)} 条")
            
            # 3. 统计并保存商户账户汇总
            self._progress("统计商户账户明细...", 96)
            self._save_flow_summary_optimized()
            
            # 4. 其他汇总统计
            self._save_delivery_summary()
            self._save_platform_summary()
            
            # 5. 保存主汇总记录
            existing = self.db.query(ReconciliationSummary).filter(
                ReconciliationSummary.task_id == self.task_id
            ).first()
            if existing:
                for key, value in summary.__dict__.items():
                    if key != '_sa_instance_state': 
                        setattr(existing, key, value)
                print("[SAVE] 更新现有汇总记录")
            else:
                self.db.add(summary)
                print("[SAVE] 创建新汇总记录")
            
            # 6. 最终 commit
            print(f"[SAVE] 执行最终 commit...")
            self.db.commit()
            self._progress("结果保存完成", 100)
            
            # 7. 验证：查询数据库确认数据已落盘
            verify_count = self.db.query(TripartiteReconciliation).filter(
                TripartiteReconciliation.task_id == self.task_id
            ).count()
            print(f"[SAVE] ✅ 数据持久化验证成功：{verify_count} 条记录已写入数据库")
            
            if verify_count == 0 and len(results) > 0:
                raise RuntimeError(f"Commit 似乎成功，但数据库中没有记录！原始 results={len(results)}")
            
        except Exception as e:
            print(f"[SAVE] !!! 保存失败，执行 rollback: {str(e)}")
            self.db.rollback()
            self._progress(f"保存结果失败: {str(e)}")
            raise

    def _save_flow_summary_optimized(self):
        """核心逻辑：按商户维度统计账户情况，仅统计结算逻辑 (包含奖励、充值)"""
        if not self.flow_records:
            return

        merchant_data = {}
        for f in self.flow_records:
            a_id = f.admin_id
            if not a_id: continue
            
            if a_id not in merchant_data:
                merchant_data[a_id] = {
                    "task_id": self.task_id,
                    "admin_id": a_id,
                    "records": [],
                    "total_deductions": 0,
                    "total_deduction_amount": 0.0,
                    "recharge_amount": 0.0,
                    "recharge_count": 0,
                    "reward_amount": 0.0,
                    "completed_order_sn": set()  # 去重订单数
                }
            
            # 汇总流水明细
            if f.type == 1: # 支出/扣款 (通常 money < 0)
                merchant_data[a_id]["total_deductions"] += 1
                merchant_data[a_id]["total_deduction_amount"] += abs(f.money)
                if f.delivery_order_id:
                    merchant_data[a_id]["completed_order_sn"].add(f.delivery_order_id)
            elif f.type == 2: # 收入 (充值/奖励)
                if f.method == 3: # 新客奖励
                    merchant_data[a_id]["reward_amount"] += f.money
                else: # 充值
                    merchant_data[a_id]["recharge_count"] += 1
                    merchant_data[a_id]["recharge_amount"] += f.money
            
            merchant_data[a_id]["records"].append(f)

        summaries = []
        for a_id, data in merchant_data.items():
            records = data["records"]
            sorted_records = sorted(records, key=lambda x: x.createtime or datetime.min)
            
            summary = MerchantSummary(
                task_id=self.task_id,
                admin_id=a_id,
                total_deductions=len(data["completed_order_sn"]), # 改为去重订单数
                total_deduction_amount=data["total_deduction_amount"],
                total_recharges=data["recharge_count"],
                total_recharge_amount=data["recharge_amount"],
                new_customer_reward=data["reward_amount"],
                balance_before=sorted_records[0].before if sorted_records else 0,
                balance_after=sorted_records[-1].after if sorted_records else 0,
                avg_deduction_amount=data["total_deduction_amount"] / len(data["completed_order_sn"]) if data["completed_order_sn"] else 0
            )
            summaries.append(summary)
            self.db.add(summary)
    
    def _save_delivery_summary(self):
        """保存配送单汇总"""
        stats = self.db.query(
            DeliveryOrder.carrier,
            DeliveryOrder.delivery_status,
            func.count(DeliveryOrder.id).label('order_count'),
            func.sum(DeliveryOrder.free).label('total_amount'),
        ).filter(
            DeliveryOrder.task_id == self.task_id
        ).group_by(
            DeliveryOrder.carrier,
            DeliveryOrder.delivery_status
        ).all()
        
        for stat in stats:
            # 保存按平台汇总
            existing = self.db.query(DeliverySummary).filter(
                and_(
                    DeliverySummary.task_id == self.task_id,
                    DeliverySummary.carrier == stat.carrier,
                    DeliverySummary.delivery_status == None,
                )
            ).first()
            
            if not existing:
                summary = DeliverySummary(
                    task_id=self.task_id,
                    carrier=stat.carrier,
                    order_count=sum(s.order_count for s in stats if s.carrier == stat.carrier),
                    total_amount=sum(s.total_amount or 0 for s in stats if s.carrier == stat.carrier),
                    avg_amount=0,
                )
                self.db.add(summary)
    
    def _save_flow_summary(self):
        """保存流水单汇总"""
        stats = self.db.query(
            FlowRecord.admin_id,
            func.count(func.distinct(FlowRecord.delivery_order_id)).label('order_count'),
            func.sum(func.abs(FlowRecord.money)).label('total_amount'),
        ).filter(
            and_(
                FlowRecord.task_id == self.task_id,
                FlowRecord.type == 1,  # 扣款
            )
        ).group_by(FlowRecord.admin_id).all()
        
        for stat in stats:
            existing = self.db.query(MerchantSummary).filter(
                and_(
                    MerchantSummary.task_id == self.task_id,
                    MerchantSummary.admin_id == stat.admin_id,
                )
            ).first()
            
            if not existing:
                summary = MerchantSummary(
                    task_id=self.task_id,
                    admin_id=stat.admin_id,
                    total_deductions=stat.order_count or 0,
                    total_deduction_amount=stat.total_amount or 0,
                )
                self.db.add(summary)
    
    def _save_platform_summary(self):
        """保存三方账单汇总"""
        stats = self.db.query(
            PlatformBill.carrier,
            PlatformBill.order_status,
            func.count(PlatformBill.id).label('order_count'),
            func.sum(PlatformBill.total_deduction).label('total_amount'),
        ).filter(
            PlatformBill.task_id == self.task_id
        ).group_by(
            PlatformBill.carrier,
            PlatformBill.order_status
        ).all()
        
        for stat in stats:
            existing = self.db.query(PlatformSummary).filter(
                and_(
                    PlatformSummary.task_id == self.task_id,
                    PlatformSummary.carrier == stat.carrier,
                )
            ).first()
            
            if not existing:
                summary = PlatformSummary(
                    task_id=self.task_id,
                    carrier=stat.carrier,
                    order_count=sum(s.order_count for s in stats if s.carrier == stat.carrier),
                    total_amount=sum(s.total_amount or 0 for s in stats if s.carrier == stat.carrier),
                )
                self.db.add(summary)
    
    # ===== 辅助方法 =====
    
    def _safe_get(self, row: Any, key: str, default: str = "") -> str:
        """安全获取值 (鲁棒版：支持模糊列名、科学计数法、后缀归一化)"""
        try:
            # 1. 尝试直接获取
            val = None
            if hasattr(row, 'get'):
                val = row.get(key)
                
                # 2. 如果没拿到，尝试查模糊匹配的键 (忽略大小写、空格)
                if pd.isna(val):
                    search_key = key.lower().strip()
                    for k in row.keys():
                        if str(k).lower().strip() == search_key:
                            val = row[k]
                            break
            
            if pd.isna(val):
                return default
            
            # 3. 处理科学计数法 (处理 Excel 读入的长数字 ID)
            s_val = str(val).strip()
            if 'e+' in s_val.lower():
                try:
                    float_val = float(s_val)
                    # '{:.0f}' 确保转为纯整数格式字符串，不带 .0
                    s_val = '{:.0f}'.format(float_val)
                except:
                    pass
            
            # 4. 去除可能存在的 .0 后缀 (pandas 有时会将纯数字读成 123.0)
            if s_val.endswith('.0'):
                s_val = s_val[:-2]
            
            # 5. 基础归一化：去除后缀 (如 _egf0vrj...)
            if '_' in s_val:
                s_val = s_val.split('_')[0]
                
            return s_val
        except:
            return default
    
    def _safe_float(self, row: pd.Series, key: str) -> float:
        """安全获取浮点值"""
        try:
            val = row.get(key)
            if pd.isna(val):
                return 0.0
            return float(str(val).replace(',', '').replace('¥', ''))
        except:
            return 0.0
    
    def _safe_int(self, row: pd.Series, key: str, default: int = 0) -> int:
        """安全获取整数值"""
        try:
            val = row.get(key)
            if pd.isna(val):
                return default
            return int(float(val))
        except:
            return default
    
    def _safe_datetime(self, row: pd.Series, key: str) -> Optional[datetime]:
        """安全获取日期时间"""
        try:
            val = row.get(key)
            if pd.isna(val):
                return None
            if isinstance(val, datetime):
                return val
            return pd.to_datetime(val)
        except:
            return None
    
    def _safe_get_third_party_id(self, row: pd.Series, carrier: str) -> str:
        """安全获取三方订单号"""
        # 转换 carrier 代码为中文名称
        carrier_cn = self.CARRIER_MAP.get(carrier, carrier)
        
        column_map = {
            "达达": "第三方订单ID",
            "闪送": "三方订单编号",
            "顺丰": "订单号",
            "蜂鸟": "第三方订单号",
            "UU跑腿": "订单号",
            "裹小递": "订单号",
        }
        column = column_map.get(carrier_cn, "第三方订单号")
        return self._safe_get(row, column)
    
    def _safe_get_platform_id(self, row: pd.Series, carrier: str) -> str:
        """安全获取平台订单号"""
        # 转换 carrier 代码为中文名称
        carrier_cn = self.CARRIER_MAP.get(carrier, carrier)
        
        column_map = {
            "达达": "达达订单ID",
            "闪送": "订单编号",
            "顺丰": "运单号",
            "蜂鸟": "蜂鸟订单号",
            "UU跑腿": "订单号",
            "裹小递": "订单号",
        }
        column = column_map.get(carrier_cn, "平台订单号")
        return self._safe_get(row, column)
    
    def _generate_carrier_bill_id(self, carrier: str, row: pd.Series) -> str:
        """生成三方账单唯一ID"""
        third_id = self._safe_get_third_party_id(row, carrier)
        return f"{carrier}_{third_id}" if third_id else str(uuid.uuid4())

    def _read_data_file(self, file_path: str) -> pd.DataFrame:
        """强化版文件读取 (自动探测表头、Sheet、跳过汇总行)"""
        if not file_path:
            return pd.DataFrame()
        
        ext = file_path.lower().split('.')[-1]
        df = pd.DataFrame()
        
        try:
            print(f"[READ] 正在读取文件: {file_path}")
            if ext in ['xlsx', 'xls']:
                # 默认读取，header=None 先把所有内容读进来
                try:
                    df = pd.read_excel(file_path, header=None)
                except Exception as e:
                    print(f"[READ] Excel 默认读取失败: {e}")
                    df = pd.read_excel(file_path)
            elif ext == 'csv':
                try:
                    df = pd.read_csv(file_path, header=None, encoding='utf-8')
                except UnicodeDecodeError:
                    df = pd.read_csv(file_path, header=None, encoding='gbk')
            
            if df.empty:
                print("[READ] ⚠️ 警告：读取到的 DataFrame 为空")
                return df
                
            # 智能探测有效表头行
            # 策略：扫描前 30 行，找到包含最多“关键词”的那一行
            keywords = ['订单', '单号', '运单', '流水', '金额', '费用', '时间', '状态']
            best_header_idx = -1
            max_keywords_match = 0
            
            # 只扫描前 30 行
            scan_limit = min(30, len(df))
            for i in range(scan_limit):
                # 将该行转为字符串列表
                row_values = df.iloc[i].astype(str).tolist()
                match_count = 0
                for val in row_values:
                    if any(k in val for k in keywords):
                        match_count += 1
                
                # 如果这一行命中了至少 2 个关键词，且比之前的更好
                if match_count >= 2 and match_count > max_keywords_match:
                    max_keywords_match = match_count
                    best_header_idx = i
            
            if best_header_idx > -1:
                print(f"[READ] 🎯 锁定表头在第 {best_header_idx + 1} 行 (匹配度: {max_keywords_match})")
                # 设置新表头
                df.columns = df.iloc[best_header_idx]
                # 截取数据部分 (从表头下一行开始)
                df = df[best_header_idx + 1:].reset_index(drop=True)
            else:
                print("[READ] 未探测到显式表头，尝试默认第一行")
                # 如果没找到，回退到默认的第一行作为表头
                df.columns = df.iloc[0]
                df = df[1:].reset_index(drop=True)
            
            # 清理列名
            df.columns = [str(c).replace('\n', '').strip() for c in df.columns]
            print(f"[READ] 最终列名: {list(df.columns)[:5]}...")
            
            return df
        except Exception as e:
            print(f"读取文件失败 {file_path}: {str(e)}")
            return pd.DataFrame()
