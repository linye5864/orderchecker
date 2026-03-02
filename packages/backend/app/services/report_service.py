"""
报告导出服务 - 支持 CSV/Excel/JSON/HTML 格式导出
"""

import io
import json
import csv
from datetime import datetime
from typing import List, Dict, Any, Optional
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.orm_task import Task, TaskStatus
from app.models.orm_delivery import DeliveryOrder
from app.models.orm_flow import FlowRecord
from app.models.orm_platform import PlatformBill
from app.models.orm_reconciliation import TripartiteReconciliation, ReconciliationSummary


class ReportService:
    """报告导出服务"""
    
    def __init__(self, db: Session, task_id: str = None):
        self.db = db
        self.task_id = task_id
    
    def export_reconciliation_results(
        self,
        format: str = "csv",
        status: str = None,
        carrier: str = None,
    ) -> bytes:
        """
        导出对账结果
        
        Args:
            format: 导出格式 (csv/excel/json)
            status: 筛选状态 (MATCHED/MINOR/MAJOR/MISSING)
            carrier: 筛选平台
        
        Returns:
            文件字节数据
        """
        query = self.db.query(TripartiteReconciliation).filter(
            TripartiteReconciliation.task_id == self.task_id
        )
        
        if status:
            query = query.filter(TripartiteReconciliation.status == status)
        if carrier:
            query = query.filter(TripartiteReconciliation.carrier == carrier)
        
        results = query.order_by(
            TripartiteReconciliation.diff_delivery_vs_flow.desc()
        ).all()
        
        if format == "json":
            return self._export_json(results)
        elif format == "csv":
            return self._export_csv(results)
        elif format == "excel":
            return self._export_excel(results)
        else:
            raise ValueError(f"不支持的格式: {format}")

    def _export_excel(self, results: List[TripartiteReconciliation]) -> bytes:
        """导出为 Excel 格式"""
        import pandas as pd
        
        data = [
            {
                "订单号": r.delivery_order_sn,
                "配送平台": r.carrier,
                "配送单金额": r.delivery_amount,
                "流水单金额": r.flow_amount,
                "三方账单金额": r.platform_amount,
                "配送-流水差异": r.diff_delivery_vs_flow,
                "配送-三方差异": r.diff_delivery_vs_platform,
                "状态": r.status,
                "差异类型": r.discrepancy_type,
                "原因": r.discrepancy_reason,
            }
            for r in results
        ]
        
        df = pd.DataFrame(data)
        output = io.BytesIO()
        
        # 使用 pandas 写入 excel
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='对账结果')
            
        return output.getvalue()
    
    def export_delivery_orders(
        self,
        format: str = "csv",
        carrier: str = None,
    ) -> bytes:
        """导出配送单"""
        query = self.db.query(DeliveryOrder).filter(
            DeliveryOrder.task_id == self.task_id
        )
        
        if carrier:
            query = query.filter(DeliveryOrder.carrier == carrier)
        
        orders = query.all()
        
        if format == "json":
            return self._export_delivery_json(orders)
        elif format == "csv":
            return self._export_delivery_csv(orders)
        else:
            raise ValueError(f"不支持的格式: {format}")
    
    def export_flow_records(
        self,
        format: str = "csv",
        admin_id: str = None,
    ) -> bytes:
        """导出流水单"""
        query = self.db.query(FlowRecord).filter(
            FlowRecord.task_id == self.task_id
        )
        
        if admin_id:
            query = query.filter(FlowRecord.admin_id == admin_id)
        
        records = query.all()
        
        if format == "json":
            return self._export_flow_json(records)
        elif format == "csv":
            return self._export_flow_csv(records)
        else:
            raise ValueError(f"不支持的格式: {format}")
    
    def export_summary_report(self) -> Dict[str, Any]:
        """导出汇总报告"""
        summary = self.db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == self.task_id
        ).first()
        
        if not summary:
            return {}
        
        # 获取各状态分布
        status_stats = self.db.query(
            TripartiteReconciliation.status,
            func.count(TripartiteReconciliation.id).label('count'),
        ).filter(
            TripartiteReconciliation.task_id == self.task_id
        ).group_by(TripartiteReconciliation.status).all()
        
        status_distribution = {s.status: s.count for s in status_stats}
        
        # 获取平台分布
        carrier_stats = self.db.query(
            TripartiteReconciliation.carrier,
            func.count(TripartiteReconciliation.id).label('count'),
        ).filter(
            TripartiteReconciliation.task_id == self.task_id
        ).group_by(TripartiteReconciliation.carrier).all()
        
        carrier_distribution = {s.carrier or "未知": s.count for s in carrier_stats}
        
        return {
            "report_time": datetime.utcnow().isoformat(),
            "task_id": str(self.task_id),
            "summary": {
                "total_orders": summary.total_orders,
                "matched_orders": summary.matched_orders,
                "match_rate": summary.match_rate,
                "discrepancy_orders": (
                    summary.minor_discrepancy_orders +
                    summary.major_discrepancy_orders +
                    summary.missing_data_orders
                ),
            },
            "amount_comparison": {
                "delivery_total": summary.total_delivery_amount,
                "flow_total": summary.total_flow_amount,
                "platform_total": summary.total_platform_amount,
                "diff_delivery_vs_flow": summary.total_diff_delivery_vs_flow,
                "diff_delivery_vs_platform": summary.total_diff_delivery_vs_platform,
            },
            "status_distribution": status_distribution,
            "carrier_distribution": carrier_distribution,
            "discrepancy_analysis": {
                "over_deduction": {
                    "count": summary.over_deduction_count,
                    "amount": summary.over_deduction_amount,
                },
                "under_deduction": {
                    "count": summary.under_deduction_count,
                    "amount": summary.under_deduction_amount,
                },
                "missing_data": {
                    "delivery_missing": summary.delivery_missing_count,
                    "flow_missing": summary.flow_missing_count,
                    "platform_missing": summary.platform_missing_count,
                },
            },
        }
    
    # ===== 私有导出方法 =====
    
    def _export_json(self, results: List[TripartiteReconciliation]) -> bytes:
        """导出为 JSON 格式"""
        data = [
            {
                "order_sn": r.delivery_order_sn,
                "carrier": r.carrier,
                "delivery_amount": r.delivery_amount,
                "flow_amount": r.flow_amount,
                "platform_amount": r.platform_amount,
                "diff_delivery_vs_flow": r.diff_delivery_vs_flow,
                "diff_delivery_vs_platform": r.diff_delivery_vs_platform,
                "status": r.status,
                "discrepancy_type": r.discrepancy_type,
                "reason": r.discrepancy_reason,
            }
            for r in results
        ]
        return json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    
    def _export_csv(self, results: List[TripartiteReconciliation]) -> bytes:
        """导出为 CSV 格式"""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # 写入表头
        writer.writerow([
            "订单号", "配送平台", "配送单金额", "流水单金额", "三方账单金额",
            "配送-流水差异", "配送-三方差异", "状态", "差异类型", "原因"
        ])
        
        # 写入数据
        for r in results:
            writer.writerow([
                r.delivery_order_sn,
                r.carrier,
                r.delivery_amount,
                r.flow_amount,
                r.platform_amount,
                r.diff_delivery_vs_flow,
                r.diff_delivery_vs_platform,
                r.status,
                r.discrepancy_type,
                r.discrepancy_reason,
            ])
        
        return output.getvalue().encode('utf-8')
    
    def _export_delivery_json(self, orders: List[DeliveryOrder]) -> bytes:
        """导出配送单为 JSON"""
        data = [
            {
                "order_sn": o.delivery_order_sn,
                "carrier": o.carrier,
                "status": o.delivery_status,
                "amount": o.free,
                "create_time": o.create_time.isoformat() if o.create_time else None,
            }
            for o in orders
        ]
        return json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    
    def _export_delivery_csv(self, orders: List[DeliveryOrder]) -> bytes:
        """导出配送单为 CSV"""
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["订单号", "配送平台", "状态", "金额", "创建时间"])
        
        for o in orders:
            writer.writerow([
                o.delivery_order_sn,
                o.carrier,
                o.delivery_status,
                o.free,
                o.create_time.isoformat() if o.create_time else None,
            ])
        
        return output.getvalue().encode('utf-8')
    
    def _export_flow_json(self, records: List[FlowRecord]) -> bytes:
        """导出流水单为 JSON"""
        data = [
            {
                "order_id": r.delivery_order_id,
                "admin_id": r.admin_id,
                "amount": r.deduction_amount,
                "balance_before": r.before,
                "balance_after": r.after,
                "trade_time": r.createtime.isoformat() if r.createtime else None,
            }
            for r in records
        ]
        return json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    
    def _export_flow_csv(self, records: List[FlowRecord]) -> bytes:
        """导出流水单为 CSV"""
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["订单号", "商户ID", "金额", "扣款前余额", "扣款后余额", "交易时间"])
        
        for r in records:
            writer.writerow([
                r.delivery_order_id,
                r.admin_id,
                r.deduction_amount,
                r.before,
                r.after,
                r.createtime.isoformat() if r.createtime else None,
            ])
        
        return output.getvalue().encode('utf-8')


# 辅助导入
from sqlalchemy import func


class HTMLReportService:
    """HTML 报表生成服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_reconciliation_report(
        self,
        task_id: uuid.UUID,
        include_details: bool = True,
        include_discrepancies: bool = True,
    ) -> str:
        """
        生成对账报表 HTML
        
        参数:
        - task_id: 任务ID
        - include_details: 是否包含订单明细
        - include_discrepancies: 是否包含差异订单
        
        返回:
        - HTML 报表内容
        """
        # 获取任务信息
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError(f"任务不存在: {task_id}")
        
        # 获取对账汇总
        summary = self._get_summary(task_id)
        
        # 获取平台级聚合
        platform_stats = self._get_platform_stats(task_id)
        
        # 获取商户级聚合
        merchant_summary = self._get_merchant_summary(task_id)
        
        # 获取差异订单
        discrepancies = []
        if include_discrepancies:
            discrepancies = self._get_discrepancy_details(task_id, limit=100)
        
        # 获取特殊订单统计
        special_orders = self._get_special_orders_stats(task_id)
        
        # 构建 HTML
        html = self._build_html(
            task=task,
            summary=summary,
            platform_stats=platform_stats,
            merchant_summary=merchant_summary,
            discrepancies=discrepancies,
            special_orders=special_orders,
        )
        
        return html
    
    def _get_summary(self, task_id: uuid.UUID) -> Dict[str, Any]:
        """获取对账汇总"""
        stats = self.db.query(
            func.count(TripartiteReconciliation.id).label('total_orders'),
            func.sum(TripartiteReconciliation.delivery_amount).label('total_delivery'),
            func.sum(TripartiteReconciliation.flow_amount).label('total_flow'),
            func.sum(TripartiteReconciliation.platform_amount).label('total_platform'),
        ).filter(TripartiteReconciliation.task_id == task_id).first()
        
        # 状态分布
        status_stats = self.db.query(
            TripartiteReconciliation.status,
            func.count(TripartiteReconciliation.id).label('count'),
        ).filter(TripartiteReconciliation.task_id == task_id).group_by(
            TripartiteReconciliation.status
        ).all()
        
        status_dist = {s.status: s.count for s in status_stats}
        
        total = stats.total_orders or 1
        matched = status_dist.get('MATCHED', 0)
        
        return {
            'total_orders': stats.total_orders or 0,
            'total_delivery_amount': stats.total_delivery or 0,
            'total_flow_amount': stats.total_flow or 0,
            'total_platform_amount': stats.total_platform or 0,
            'matched_count': matched,
            'minor_discrepancy_count': status_dist.get('MINOR', 0),
            'major_discrepancy_count': status_dist.get('MAJOR', 0),
            'missing_count': status_dist.get('MISSING', 0),
            'match_rate': round(matched / total * 100, 2) if total > 0 else 0,
        }
    
    def _get_platform_stats(self, task_id: uuid.UUID) -> List[Dict[str, Any]]:
        """获取平台级统计"""
        stats = self.db.query(
            TripartiteReconciliation.carrier,
            func.count(TripartiteReconciliation.id).label('order_count'),
            func.sum(TripartiteReconciliation.delivery_amount).label('delivery_amount'),
            func.sum(TripartiteReconciliation.flow_amount).label('flow_amount'),
            func.sum(TripartiteReconciliation.platform_amount).label('platform_amount'),
        ).filter(
            TripartiteReconciliation.task_id == task_id,
            TripartiteReconciliation.status == 'MATCHED',
        ).group_by(TripartiteReconciliation.carrier).all()
        
        result = []
        for s in stats:
            total = s.order_count or 1
            result.append({
                'carrier': s.carrier or '未知',
                'order_count': s.order_count or 0,
                'total_delivery_amount': s.delivery_amount or 0,
                'total_flow_amount': s.flow_amount or 0,
                'total_platform_amount': s.platform_amount or 0,
                'match_rate': 100,
            })
        
        return result
    
    def _get_merchant_summary(self, task_id: uuid.UUID) -> List[Dict[str, Any]]:
        """获取商户级统计"""
        stats = self.db.query(
            FlowRecord.admin_id,
            func.count(func.distinct(FlowRecord.delivery_order_id)).label('order_count'),
            func.sum(func.abs(FlowRecord.money)).label('total_amount'),
        ).filter(
            FlowRecord.task_id == task_id,
            FlowRecord.type == 1,
        ).group_by(FlowRecord.admin_id).all()
        
        result = []
        for s in stats:
            result.append({
                'admin_id': s.admin_id or '未知',
                'deduction': {
                    'order_count': s.order_count or 0,
                    'total_amount': round(s.total_amount or 0, 2),
                },
                'reward': {'count': 0, 'amount': 0},
                'recharge': {'count': 0, 'amount': 0},
            })
        
        return result
    
    def _get_discrepancy_details(
        self,
        task_id: uuid.UUID,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """获取差异订单详情"""
        records = self.db.query(TripartiteReconciliation).filter(
            TripartiteReconciliation.task_id == task_id,
            TripartiteReconciliation.status != 'MATCHED',
        ).order_by(
            TripartiteReconciliation.diff_delivery_vs_flow.desc()
        ).limit(limit).all()
        
        result = []
        for r in records:
            result.append({
                'delivery_order_sn': r.delivery_order_sn,
                'carrier': r.carrier,
                'delivery_amount': r.delivery_amount,
                'flow_amount': r.flow_amount,
                'difference_amount': r.diff_delivery_vs_flow,
                'status': r.status,
            })
        
        return result
    
    def _get_special_orders_stats(self, task_id: uuid.UUID) -> Dict[str, Any]:
        """获取特殊订单统计"""
        records = self.db.query(FlowRecord).filter(
            FlowRecord.task_id == task_id,
            FlowRecord.memo != None,
            FlowRecord.memo != '',
        ).all()
        
        refund_count = 0
        refund_amount = 0
        discount_count = 0
        discount_amount = 0
        
        for r in records:
            memo = r.memo or ""
            money = r.money or 0
            
            if "退还" in memo or "退款" in memo:
                refund_count += 1
                refund_amount += money
            elif "补差价" in memo:
                discount_count += 1
                discount_amount += abs(money)
        
        return {
            'summary': {
                'refund': {'count': refund_count, 'amount': round(refund_amount, 2)},
                'discount': {'count': discount_count, 'amount': round(discount_amount, 2)},
            }
        }
    
    def _build_html(
        self,
        task: Task,
        summary: Dict[str, Any],
        platform_stats: List[Dict[str, Any]],
        merchant_summary: List[Dict[str, Any]],
        discrepancies: List[Dict[str, Any]],
        special_orders: Dict[str, Any],
    ) -> str:
        """构建 HTML 报表"""
        
        def fmt_money(n):
            if n is None:
                return "¥0.00"
            return f"¥{float(n):,.2f}"
        
        generate_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        task_id_str = str(task.id)
        
        status_map = {
            "INIT": "初始化",
            "UPLOADED": "已上传",
            "PARSING": "解析中",
            "NORMALIZING": "标准化中",
            "MATCHING": "匹配中",
            "AGGREGATING": "汇总中",
            "FINISHED": "完成",
            "FAILED": "失败",
        }
        task_status = status_map.get(task.status, task.status)
        
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>对账报表 - {task.name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333; background: #f5f5f5; padding: 20px; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 30px 40px; border-radius: 8px 8px 0 0; }}
        .header h1 {{ font-size: 28px; margin-bottom: 10px; }}
        .header-meta {{ display: flex; gap: 30px; font-size: 14px; opacity: 0.9; }}
        .content {{ padding: 30px 40px; }}
        .section {{ margin-bottom: 40px; }}
        .section-title {{ font-size: 20px; font-weight: 600; color: #333; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #667eea; }}
        .summary-cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .card {{ background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border-radius: 8px; padding: 20px; text-align: center; }}
        .card-value {{ font-size: 32px; font-weight: 700; color: #667eea; }}
        .card-label {{ font-size: 14px; color: #666; margin-top: 5px; }}
        .card.highlight {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
        .card.highlight .card-value {{ color: #fff; }}
        .card.highlight .card-label {{ color: rgba(255,255,255,0.9); }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th, td {{ padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }}
        th {{ background: #f8f9fa; font-weight: 600; }}
        tr:hover {{ background: #f8f9fa; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }}
        .badge-success {{ background: #d4edda; color: #155724; }}
        .badge-warning {{ background: #fff3cd; color: #856404; }}
        .badge-danger {{ background: #f8d7da; color: #721c24; }}
        .print-btn {{ position: fixed; top: 20px; right: 20px; padding: 12px 24px; background: #667eea; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; z-index: 1000; }}
        .print-btn:hover {{ background: #5a6fd6; }}
        @media print {{ body {{ padding: 0; background: #fff; }} .container {{ box-shadow: none; }} .print-btn {{ display: none; }} }}
        .footer {{ background: #f8f9fa; padding: 20px 40px; text-align: center; color: #666; font-size: 12px; border-radius: 0 0 8px 8px; }}
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">🖨️ 打印报表</button>
    
    <div class="container">
        <div class="header">
            <h1>📊 对账报表</h1>
            <div class="header-meta">
                <span>📋 {task.name}</span>
                <span>📅 {generate_time}</span>
                <span>📍 <span class="badge badge-success">{task_status}</span></span>
            </div>
        </div>
        
        <div class="content">
            <!-- 汇总统计 -->
            <div class="section">
                <h2 class="section-title">📈 汇总统计</h2>
                <div class="summary-cards">
                    <div class="card"><div class="card-value">{summary['total_orders']}</div><div class="card-label">订单总数</div></div>
                    <div class="card"><div class="card-value">{fmt_money(summary['total_delivery_amount'])}</div><div class="card-label">配送金额</div></div>
                    <div class="card"><div class="card-value">{fmt_money(summary['total_flow_amount'])}</div><div class="card-label">流水金额</div></div>
                    <div class="card highlight"><div class="card-value">{summary['match_rate']}%</div><div class="card-label">匹配率</div></div>
                </div>
            </div>
            
            <!-- 差异统计 -->
            <div class="section">
                <h2 class="section-title">⚠️ 差异统计</h2>
                <div class="summary-cards">
                    <div class="card" style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);"><div class="card-value" style="color: #155724;">{summary['matched_count']}</div><div class="card-label">完全匹配</div></div>
                    <div class="card" style="background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%);"><div class="card-value" style="color: #856404;">{summary['minor_discrepancy_count']}</div><div class="card-label">小差异 (≤10元)</div></div>
                    <div class="card" style="background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);"><div class="card-value" style="color: #721c24;">{summary['major_discrepancy_count']}</div><div class="card-label">大差异 (>10元)</div></div>
                    <div class="card" style="background: linear-gradient(135deg, #e2e3e5 0%, #d6d8db 100%);"><div class="card-value" style="color: #383d41;">{summary['missing_count']}</div><div class="card-label">缺失订单</div></div>
                </div>
            </div>
            
            <!-- 平台统计 -->
            <div class="section">
                <h2 class="section-title">🚗 平台统计</h2>
                <table>
                    <thead><tr><th>平台</th><th>订单数</th><th>配送金额</th><th>流水金额</th><th>平台金额</th><th>匹配率</th></tr></thead>
                    <tbody>
"""
        
        for p in platform_stats:
            html += f"""                        <tr>
                            <td><strong>{p['carrier']}</strong></td>
                            <td>{p['order_count']}</td>
                            <td>{fmt_money(p['total_delivery_amount'])}</td>
                            <td>{fmt_money(p['total_flow_amount'])}</td>
                            <td>{fmt_money(p['total_platform_amount'])}</td>
                            <td><span class="badge badge-success">{p['match_rate']}%</span></td>
                        </tr>
"""
        
        html += """                    </tbody>
                </table>
            </div>
            
            <!-- 商户统计 -->
            <div class="section">
                <h2 class="section-title">🏪 商户统计 (前20个)</h2>
                <table>
                    <thead><tr><th>商户ID</th><th>扣款笔数</th><th>扣款金额</th><th>奖励</th><th>充值</th></tr></thead>
                    <tbody>
"""
        
        for m in merchant_summary[:20]:
            html += f"""                        <tr>
                            <td><strong>{m['admin_id']}</strong></td>
                            <td>{m['deduction']['order_count']}</td>
                            <td>{fmt_money(m['deduction']['total_amount'])}</td>
                            <td>{fmt_money(m['reward']['amount'])}</td>
                            <td>{fmt_money(m['recharge']['amount'])}</td>
                        </tr>
"""
        
        html += """                    </tbody>
                </table>
            </div>
            
            <!-- 特殊订单 -->
            <div class="section">
                <h2 class="section-title">📋 特殊订单统计</h2>
                <div class="summary-cards">
                    <div class="card"><div class="card-value">{special_orders['summary']['refund']['count']}</div><div class="card-label">退款订单</div></div>
                    <div class="card"><div class="card-value">{fmt_money(special_orders['summary']['refund']['amount'])}</div><div class="card-label">退款金额</div></div>
                    <div class="card"><div class="card-value">{special_orders['summary']['discount']['count']}</div><div class="card-label">补差价订单</div></div>
                    <div class="card"><div class="card-value">{fmt_money(special_orders['summary']['discount']['amount'])}</div><div class="card-label">补差价金额</div></div>
                </div>
            </div>
"""
        
        # 差异订单明细
        if discrepancies:
            html += f"""
            <div class="section">
                <h2 class="section-title">⚠️ 差异订单明细 (前100个)</h2>
                <table>
                    <thead><tr><th>订单号</th><th>平台</th><th>配送</th><th>流水</th><th>差异</th><th>状态</th></tr></thead>
                    <tbody>
"""
            
            for d in discrepancies:
                order_sn = d.get('delivery_order_sn', '')[:30]
                status = d.get('status', '')
                if status == 'MINOR':
                    badge, status_text = 'badge-warning', '小差异'
                elif status == 'MAJOR':
                    badge, status_text = 'badge-danger', '大差异'
                else:
                    badge, status_text = 'badge-secondary', status
                
                html += f"""                        <tr>
                            <td><strong>{order_sn}</strong></td>
                            <td>{d.get('carrier', '未知')}</td>
                            <td>{fmt_money(d.get('delivery_amount', 0))}</td>
                            <td>{fmt_money(d.get('flow_amount', 0))}</td>
                            <td>{fmt_money(d.get('difference_amount', 0))}</td>
                            <td><span class="badge {badge}">{status_text}</span></td>
                        </tr>
"""
            
            html += """                    </tbody>
                </table>
            </div>
"""
        
        html += f"""
        </div>
        
        <div class="footer">
            <p>报表生成时间: {generate_time} | 任务ID: {task_id_str}</p>
            <p>OrderComparer 对账系统</p>
        </div>
    </div>
</body>
</html>
"""
        
        return html
