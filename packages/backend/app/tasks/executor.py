"""
任务执行服务
状态机 orchestration 和 TripartiteReconciliationEngine V2 集成
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, cast
from contextlib import contextmanager

from sqlalchemy.orm import Session
from celery import shared_task

from app.models.orm_task import Task
from app.models.orm_file import UploadedFile, FileType
from app.models.orm_reconciliation import TripartiteReconciliation, ReconciliationSummary
from app.tasks.state_machine import TaskStateMachine, TransitionError, TaskStatus
from app.tasks.progress_callback import create_progress_callback, ProgressCallbackManager, TaskProgressCallback
from app.services.task_crud_service import TaskCRUDService
from app.services.file_service import FileProcessingService
from app.services.reconciliation_engine_v2 import TripartiteReconciliationEngine


class TaskExecutionService:
    """任务执行服务 - 管理状态机流转"""

    def __init__(self, db: Session):
        self.db = db
        self.task_service = TaskCRUDService(db)
        self.file_service = FileProcessingService(db)

    @contextmanager
    def execute_task(self, task_id: uuid.UUID):
        """任务执行上下文管理器"""
        task = self.task_service.get_by_id(task_id)
        if not task:
            raise ValueError(f"任务不存在: {task_id}")

        # 创建进度回调
        callback = create_progress_callback(str(task_id))
        callback.set_total_steps(10)

        try:
            # 验证初始状态
            current_status = getattr(task.status, 'value', str(task.status))
            init_status_val = getattr(TaskStatus.INIT, 'value', TaskStatus.INIT)
            if current_status != init_status_val:
                raise TransitionError(f"任务状态不正确: {task.status}")

            # 开始执行
            self._transition_to(task_id, TaskStatus.UPLOADED, 5, "文件上传完成")
            yield callback
            self._transition_to(task_id, TaskStatus.PARSING, 10, "开始解析文件")

        except Exception as e:
            self.task_service.set_error(task_id, str(e))
            raise
        finally:
            ProgressCallbackManager.remove_callback(str(task_id))

    def _transition_to(
        self,
        task_id: uuid.UUID,
        new_status: TaskStatus,
        progress: float,
        message: str,
    ):
        """状态转换"""
        task = self.task_service.get_by_id(task_id)
        if not task:
            return

        # 获取当前状态值（确保是字符串）
        current_status_value = task.status.value if hasattr(task.status, 'value') else str(task.status)  # type: ignore

        # 如果已经是终态，跳过转换
        finished_val = getattr(TaskStatus.FINISHED, 'value', TaskStatus.FINISHED)
        failed_val = getattr(TaskStatus.FAILED, 'value', TaskStatus.FAILED)
        if current_status_value in [finished_val, failed_val]:
            return

        # 验证转换
        from_status = cast(TaskStatus, TaskStatus(current_status_value))
        TaskStateMachine.validate_transition(from_status, new_status)

        # 更新状态
        self.task_service.update_status(
            task_id=task_id,
            status=new_status,
            progress=progress,
            message=message,
        )

    def run_reconciliation(self, task_id: uuid.UUID, file_ids: List[str]):
        """
        执行三方对账任务 (同步版本)
        """
        print(f"\n[ENGINE] >>> 启动对账任务: {task_id}")
        print(f"[ENGINE] 关联文件数量: {len(file_ids)}")
        
        try:
            with self.execute_task(task_id) as callback:
                # 阶段 1: 解析文件
                self._transition_to(task_id, TaskStatus.PARSING, 15, "正在解析文件...")
                
                # 解析三类文件
                delivery_file_path, flow_file_path, platform_files = self._parse_all_files(task_id, file_ids, callback)
                
                if not delivery_file_path:
                    raise ValueError("未找到有效的配送单文件")
                
                # 兼容性处理：平台账单现在设为可选，若缺失则降级为二方对账
                if not platform_files:
                    callback.warning("未检测到有效的平台账单文件，将进行业务-流水二方对账")

                # 阶段 2: 执行三方对账 (V2 引擎)
                self._transition_to(task_id, TaskStatus.MATCHING, 50, "正在进行三方对账匹配...")
                
                # 创建 V2 对账引擎
                engine = TripartiteReconciliationEngine(self.db, task_id)
                
                def progress_callback(message: str, prog: float = None):
                    print(f"[PROGRESS] {task_id} -> {message} ({prog if prog is not None else ''}%)")
                    if prog is not None:
                        self._transition_to(task_id, TaskStatus.MATCHING, 50 + prog * 0.3, message)
                        callback.info(message)
                
                engine._progress = progress_callback
                
                # 执行对账
                summary = engine.perform_reconciliation(
                    delivery_file_path=delivery_file_path,
                    flow_file_path=flow_file_path,
                    platform_files=platform_files,
                )

                # 阶段 3: 完成
                self._transition_to(task_id, TaskStatus.FINISHED, 100, "对账完成")
                callback.info(f"对账完成: 总计 {summary.total_orders}, 匹配 {summary.matched_orders}")
                print(f"[ENGINE] <<< 对账任务顺利完成: {task_id}")
                return summary
            
        except Exception as e:
            print(f"[ENGINE] !!! 任务执行发生致命异常: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    def _parse_all_files(
        self,
        task_id: uuid.UUID,
        file_ids: List[str],
        callback: TaskProgressCallback,
    ) -> Tuple[str, Optional[str], Dict[str, str]]:
        """
        解析三类文件
        
        Returns:
            Tuple[delivery_file_path, flow_file_path, platform_files]
        """
        callback.info("解析数据文件中...")
        
        delivery_file_path = None
        flow_file_path = None
        platform_files = {}
        
        for file_id in file_ids:
            try:
                file_uuid = uuid.UUID(file_id)
            except ValueError:
                continue

            # 获取文件记录
            file_record = self.file_service.get_file_by_id(file_uuid)
            if not file_record:
                continue

            # 鲁棒的扩展名检查 (不区分大小写)
            path_lower = str(file_record.file_path).lower()
            if not path_lower.endswith(('.xlsx', '.xls', '.csv')):
                continue

            # 根据文件类型分类 (支持枚举或字符串比较)
            ftype = getattr(file_record.file_type, 'value', str(file_record.file_type))
            
            delivery_val = getattr(FileType.DELIVERY, 'value', 'delivery')
            if ftype == delivery_val or ftype == 'delivery':
                delivery_file_path = file_record.file_path
                callback.info(f"  配送单: {file_record.original_filename}")
                
            elif ftype == getattr(FileType.FLOW, 'value', 'flow') or ftype == 'flow':
                flow_file_path = file_record.file_path
                callback.info(f"  流水单: {file_record.original_filename}")
                
            elif ftype.lower() in [getattr(FileType.PLATFORM, 'value', 'platform').lower(), 'platform', 'platform_bill']:
                # 检测平台类型
                platform_id = self._detect_platform(file_record.original_filename)
                platform_files[platform_id] = file_record.file_path
                callback.info(f"  平台账单 ({platform_id}): {file_record.original_filename}")
        
        msg = f"文件解析完成: 配送单={delivery_file_path is not None}, 流水单={flow_file_path is not None}, 平台={len(platform_files)}个"
        callback.info(msg)
        
        # 将调试信息更新到任务消息中，方便前端查看
        status_msg = f"已就绪: {msg}"
        self.task_service.update_status(task_id, TaskStatus.PARSING, 20, status_msg)
        
        return delivery_file_path, flow_file_path, platform_files

    def _detect_platform(self, filename: str) -> str:
        """根据文件名检测平台类型"""
        filename_lower = filename.lower()
        if '达达' in filename or 'dada' in filename_lower:
            return 'dada'
        elif '顺丰' in filename:
            if '企业c' in filename_lower or 'enterprise' in filename_lower:
                return 'sf_enterprise'
            return 'sf'
        elif '蜂鸟' in filename or 'hh' in filename_lower:
            return 'hh'
        elif '闪送' in filename or 'ss' in filename_lower or 'shansong' in filename_lower:
            return 'ss'
        elif 'uu' in filename_lower or 'uu跑腿' in filename:
            return 'uu'
        elif '裹小递' in filename or 'gxd' in filename_lower or 'guoxiaodi' in filename_lower:
            return 'gxd'
        return 'unknown'


# Celery 异步任务
@shared_task(
    bind=True,
    name="tasks.run_reconciliation_task",
    max_retries=3,
    default_retry_delay=60,
)
def run_reconciliation_task(self, task_id: str, file_ids: list):
    """Celery 异步对账任务"""
    from app.core.database import get_db_context

    task_uuid = uuid.UUID(task_id)

    with get_db_context() as db:
        service = TaskExecutionService(db)

        try:
            return service.run_reconciliation(task_uuid, file_ids)
        except Exception as e:
            # 重试逻辑
            self.retry(exc=e)
