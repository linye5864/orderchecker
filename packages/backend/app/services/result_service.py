"""
结果服务
对账结果查询和数据导出
"""

from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, Integer

from app.models.result import ResultDetailInDB, ResultSummary, ResultStatus
from app.models.orm_result import ReconciliationResult
from app.models.orm_reconciliation import TripartiteReconciliation, ReconciliationStatus


class ResultService:
    """结果服务 - 负责对账结果查询和导出"""

    def __init__(self, db: Session):
        self.db = db

    def get_summary(self, task_id: str) -> Optional[ResultSummary]:
        """获取汇总统计"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return None

        # 优先查询三方对账结果
        stats = (
            self.db.query(
                func.count(TripartiteReconciliation.id).label("total"),
                func.sum(
                    func.cast(TripartiteReconciliation.delivery_amount * 100, Integer)
                ).label("total_delivery"),
                func.sum(
                    func.cast(TripartiteReconciliation.flow_amount * 100, Integer)
                ).label("total_flow"),
                func.sum(
                    func.cast(TripartiteReconciliation.platform_amount * 100, Integer)
                ).label("total_platform"),
            )
            .filter(TripartiteReconciliation.task_id == task_uuid)
            .first()
        )

        if not stats or stats.total == 0:
            return None

        matched = (
            self.db.query(func.count(TripartiteReconciliation.id))
            .filter(
                TripartiteReconciliation.task_id == task_uuid,
                TripartiteReconciliation.status == ReconciliationStatus.MATCHED.value,
            )
            .scalar()
        ) or 0

        exception_count = (
            self.db.query(func.count(TripartiteReconciliation.id))
            .filter(
                TripartiteReconciliation.task_id == task_uuid,
                TripartiteReconciliation.status.in_([
                    ReconciliationStatus.MINOR_DISCREPANCY.value,
                    ReconciliationStatus.MAJOR_DISCREPANCY.value,
                ]),
            )
            .scalar()
        ) or 0

        missing = (
            self.db.query(func.count(TripartiteReconciliation.id))
            .filter(
                TripartiteReconciliation.task_id == task_uuid,
                TripartiteReconciliation.status == ReconciliationStatus.MISSING_DATA.value,
            )
            .scalar()
        ) or 0

        total_delivery = (stats.total_delivery or 0) / 100.0
        total_platform = (stats.total_platform or 0) / 100.0

        return ResultSummary(
            total_orders=stats.total,
            matched_orders=matched,
            exception_orders=exception_count,
            missing_orders=missing,
            match_rate=round(matched / stats.total * 100, 2) if stats.total > 0 else 0,
            total_local_amount=total_delivery,
            total_platform_amount=total_platform,
            total_amount_diff=round(total_platform - total_delivery, 2),
        )

    def get_details(
        self,
        task_id: str,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[ResultDetailInDB], int]:
        """获取结果明细 (分页)"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return [], 0

        # 优先查询三方对账结果
        query = self.db.query(TripartiteReconciliation).filter(
            TripartiteReconciliation.task_id == task_uuid
        )

        # 按状态筛选
        if status:
            try:
                query = query.filter(TripartiteReconciliation.status == status)
            except ValueError:
                pass

        # 总数
        total = query.count()

        # 分页查询
        results = (
            query.order_by(desc(TripartiteReconciliation.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        # 转换为 Pydantic 模型
        details = []
        for r in results:
            # 映射三方对账状态到通用状态
            if r.status == ReconciliationStatus.MATCHED.value:
                result_status = ResultStatus.MATCHED
            elif r.status == ReconciliationStatus.MISSING_DATA.value:
                result_status = ResultStatus.MISSING
            else:
                result_status = ResultStatus.EXCEPTION

            details.append(
                ResultDetailInDB(
                    id=str(r.id),
                    task_id=str(r.task_id),
                    order_number=r.delivery_order_sn or "",
                    platform_order_number=r.platform_order_id or "",
                    status=result_status,
                    local_amount=r.delivery_amount,
                    platform_amount=r.platform_amount,
                    amount_diff=r.diff_delivery_vs_flow,
                    local_status=r.delivery_status,
                    platform_status=r.platform_order_status,
                    reason=r.discrepancy_reason,
                    created_at=r.created_at,
                )
            )

        return details, total

    def get_details_by_status(
        self,
        task_id: str,
        status: ResultStatus,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[ReconciliationResult], int]:
        """获取特定状态的订单明细"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return [], 0

        query = self.db.query(ReconciliationResult).filter(
            ReconciliationResult.task_id == task_uuid,
            ReconciliationResult.status == status,
        )

        total = query.count()
        results = (
            query.order_by(desc(ReconciliationResult.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return results, total

    def export(
        self,
        task_id: str,
        format: str = "csv",
        status: Optional[str] = None,
    ) -> dict:
        """导出结果 (CSV/Excel)"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return {"error": "无效的任务ID"}

        # 构建查询
        query = self.db.query(ReconciliationResult).filter(
            ReconciliationResult.task_id == task_uuid
        )

        if status:
            try:
                result_status = ResultStatus(status)
                query = query.filter(ReconciliationResult.status == result_status)
            except ValueError:
                pass

        results = query.order_by(desc(ReconciliationResult.created_at)).all()

        if not results:
            return {"error": "没有可导出的数据"}

        if format == "csv":
            return self._export_csv(task_id, results)
        elif format == "json":
            return self._export_json(task_id, results)
        else:
            return {"error": f"不支持的导出格式: {format}"}

    def _export_csv(self, task_id: str, results: List[ReconciliationResult]) -> dict:
        """导出为 CSV"""
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        # 表头
        writer.writerow([
            "配送单号",
            "平台订单号",
            "状态",
            "本地金额",
            "平台金额",
            "金额差异",
            "本地状态",
            "平台状态",
            "异常原因",
        ])

        # 数据
        for r in results:
            writer.writerow([
                r.order_number,
                r.platform_order_number or "",
                r.status.value,
                r.local_amount,
                r.platform_amount,
                r.amount_diff,
                r.local_status or "",
                r.platform_status or "",
                r.reason or "",
            ])

        return {
            "format": "csv",
            "task_id": task_id,
            "count": len(results),
            "data": output.getvalue(),
        }

    def _export_json(self, task_id: str, results: List[ReconciliationResult]) -> dict:
        """导出为 JSON"""
        import json

        data = []
        for r in results:
            data.append({
                "order_number": r.order_number,
                "platform_order_number": r.platform_order_number,
                "status": r.status.value,
                "local_amount": r.local_amount,
                "platform_amount": r.platform_amount,
                "amount_diff": r.amount_diff,
                "local_status": r.local_status,
                "platform_status": r.platform_status,
                "reason": r.reason,
                "created_at": r.created_at.isoformat(),
            })

        return {
            "format": "json",
            "task_id": task_id,
            "count": len(results),
            "data": data,
        }

    def delete_by_task(self, task_id: str) -> int:
        """删除任务的所有结果"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return 0

        result = self.db.query(ReconciliationResult).filter(
            ReconciliationResult.task_id == task_uuid
        ).delete()

        self.db.commit()
        return result

    def _parse_uuid(self, value) -> Optional:
        """安全解析 UUID"""
        import uuid
        # 如果已经是 UUID 对象，直接返回
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(value)
        except (ValueError, TypeError, AttributeError):
            return None
