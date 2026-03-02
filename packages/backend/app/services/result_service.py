"""
结果服务
对账结果查询和数据导出
"""

from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.result import ResultDetailInDB, ResultSummary, ResultStatus
from app.models.orm_result import ReconciliationResult


class ResultService:
    """结果服务 - 负责对账结果查询和导出"""

    def __init__(self, db: Session):
        self.db = db

    def get_summary(self, task_id: str) -> Optional[ResultSummary]:
        """获取汇总统计"""
        task_uuid = self._parse_uuid(task_id)
        if not task_uuid:
            return None

        # 查询结果统计
        stats = (
            self.db.query(
                func.count(ReconciliationResult.id).label("total"),
                func.sum(
                    func.cast(ReconciliationResult.local_amount * 100, func.sqltype.Integer)
                ).label("total_local"),
                func.sum(
                    func.cast(ReconciliationResult.platform_amount * 100, func.sqltype.Integer)
                ).label("total_platform"),
            )
            .filter(ReconciliationResult.task_id == task_uuid)
            .first()
        )

        if not stats or stats.total == 0:
            return None

        matched = (
            self.db.query(func.count(ReconciliationResult.id))
            .filter(
                ReconciliationResult.task_id == task_uuid,
                ReconciliationResult.status == ResultStatus.MATCHED,
            )
            .scalar()
        ) or 0

        exception_count = (
            self.db.query(func.count(ReconciliationResult.id))
            .filter(
                ReconciliationResult.task_id == task_uuid,
                ReconciliationResult.status == ResultStatus.EXCEPTION,
            )
            .scalar()
        ) or 0

        missing = (
            self.db.query(func.count(ReconciliationResult.id))
            .filter(
                ReconciliationResult.task_id == task_uuid,
                ReconciliationResult.status == ResultStatus.MISSING,
            )
            .scalar()
        ) or 0

        total_local = (stats.total_local or 0) / 100.0
        total_platform = (stats.total_platform or 0) / 100.0

        return ResultSummary(
            total_orders=stats.total,
            matched_orders=matched,
            exception_orders=exception_count,
            missing_orders=missing,
            match_rate=round(matched / stats.total * 100, 2) if stats.total > 0 else 0,
            total_local_amount=total_local,
            total_platform_amount=total_platform,
            total_amount_diff=round(total_platform - total_local, 2),
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

        # 构建查询
        query = self.db.query(ReconciliationResult).filter(
            ReconciliationResult.task_id == task_uuid
        )

        # 按状态筛选
        if status:
            try:
                result_status = ResultStatus(status)
                query = query.filter(ReconciliationResult.status == result_status)
            except ValueError:
                pass

        # 总数
        total = query.count()

        # 分页查询
        results = (
            query.order_by(desc(ReconciliationResult.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        # 转换为 Pydantic 模型
        details = []
        for r in results:
            details.append(
                ResultDetailInDB(
                    id=str(r.id),
                    task_id=str(r.task_id),
                    order_number=r.order_number,
                    platform_order_number=r.platform_order_number or "",
                    status=r.status,
                    local_amount=r.local_amount,
                    platform_amount=r.platform_amount,
                    amount_diff=r.amount_diff,
                    local_status=r.local_status,
                    platform_status=r.platform_status,
                    reason=r.reason,
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

    def _parse_uuid(self, value: str) -> Optional:
        """安全解析 UUID"""
        import uuid
        try:
            return uuid.UUID(value)
        except ValueError:
            return None
