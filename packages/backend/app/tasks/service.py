"""
任务服务
业务逻辑层
"""

from datetime import datetime
from typing import Optional, List, Tuple
import uuid

from app.models.task import Task, TaskCreate, TaskStatus, TaskUpdate
from app.ws.manager import ws_manager


class TaskService:
    """任务服务"""
    
    # 模拟任务存储（生产环境应从数据库读取）
    _tasks: dict = {}
    
    def __init__(self):
        # 初始化一些示例任务
        if not TaskService._tasks:
            self._init_sample_tasks()
    
    def _init_sample_tasks(self):
        """初始化示例任务"""
        sample_tasks = [
            {
                "id": "task-001",
                "name": "8月份对账",
                "description": "2024年8月份配送订单对账",
                "status": TaskStatus.FINISHED,
                "progress": 100.0,
                "message": "对账完成",
                "user_id": "user-001",
                "created_at": datetime.utcnow(),
            },
            {
                "id": "task-002",
                "name": "9月份对账",
                "description": "2024年9月份配送订单对账",
                "status": TaskStatus.MATCHING,
                "progress": 65.0,
                "message": "正在进行主键匹配",
                "user_id": "user-001",
                "created_at": datetime.utcnow(),
            },
        ]
        
        for task_data in sample_tasks:
            task = Task(**task_data)
            TaskService._tasks[task.id] = task
    
    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        page: int = 1,
        page_size: int = 20,
        user_id: Optional[str] = None,
    ) -> Tuple[List[Task], int]:
        """获取任务列表"""
        tasks = list(TaskService._tasks.values())
        
        # 过滤
        if status:
            tasks = [t for t in tasks if t.status == status]
        if user_id:
            tasks = [t for t in tasks if t.user_id == user_id]
        
        # 排序（按创建时间倒序）
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        
        # 分页
        total = len(tasks)
        start = (page - 1) * page_size
        end = start + page_size
        tasks = tasks[start:end]
        
        return tasks, total
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务详情"""
        return TaskService._tasks.get(task_id)
    
    def create_task(
        self,
        name: str,
        description: Optional[str] = None,
        file_ids: List[str] = None,
        user_id: str = "anonymous",
    ) -> Task:
        """创建新任务"""
        task = Task(
            id=f"task-{uuid.uuid4().hex[:8]}",
            name=name,
            description=description,
            status=TaskStatus.INIT,
            progress=0.0,
            message="任务已创建",
            user_id=user_id,
            created_at=datetime.utcnow(),
        )
        
        TaskService._tasks[task.id] = task
        
        # 广播进度
        self._broadcast_progress(task)
        
        return task
    
    def update_task(
        self,
        task_id: str,
        update: TaskUpdate,
    ) -> Optional[Task]:
        """更新任务"""
        task = TaskService._tasks.get(task_id)
        if not task:
            return None
        
        # 更新字段
        if update.status is not None:
            task.status = update.status
        if update.progress is not None:
            task.progress = update.progress
        if update.message is not None:
            task.message = update.message
        if update.error_message is not None:
            task.error_message = update.error_message
        
        task.updated_at = datetime.utcnow()
        
        # 广播进度
        self._broadcast_progress(task)
        
        return task
    
    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        task = TaskService._tasks.get(task_id)
        if not task:
            return False
        
        # 只有进行中的任务可以取消
        if task.status in [TaskStatus.FINISHED, TaskStatus.FAILED]:
            return False
        
        task.status = TaskStatus.FAILED
        task.message = "任务已取消"
        task.error_message = "用户取消"
        task.updated_at = datetime.utcnow()
        
        # 广播进度
        self._broadcast_progress(task)
        
        return True
    
    def _broadcast_progress(self, task: Task):
        """广播任务进度"""
        import asyncio
        
        try:
            asyncio.get_event_loop().create_task(
                ws_manager.broadcast_task_progress(
                    task_id=task.id,
                    status=task.status.value,
                    progress=task.progress,
                    message=task.message,
                )
            )
        except RuntimeError:
            # 没有事件循环，忽略
            pass
