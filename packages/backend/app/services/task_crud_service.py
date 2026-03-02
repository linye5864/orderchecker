"""
任务 CRUD 服务
"""

from datetime import datetime
from typing import Optional, List, Tuple
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.task import TaskCreate, TaskUpdate
from app.models.orm_task import Task
from app.models.orm_result import ReconciliationResult
from app.tasks.state_machine import TaskStatus


class TaskCRUDService:
    """任务 CRUD 服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create(self, name: str, description: Optional[str] = None, 
               file_ids: List[str] = None, user_id: str = None) -> Task:
        """创建任务"""
        task = Task(
            id=uuid.uuid4(),
            name=name,
            description=description,
            status=TaskStatus.INIT.value,
            progress=0.0,
            message="任务已创建",
            file_ids=file_ids or [],
            user_id=uuid.UUID(user_id) if user_id else None,
            created_at=datetime.utcnow(),
        )
        
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def get_by_id(self, task_id: uuid.UUID) -> Optional[Task]:
        """根据 ID 获取任务"""
        return self.db.query(Task).filter(Task.id == task_id).first()
    
    def list_tasks(
        self,
        user_id: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Tuple[List[Task], int]:
        """获取任务列表"""
        query = self.db.query(Task)
        
        if user_id:
            query = query.filter(Task.user_id == uuid.UUID(user_id))
        if status:
            query = query.filter(Task.status == status.value)
        
        total = query.count()
        tasks = query.order_by(desc(Task.created_at)).offset(skip).limit(limit).all()
        
        return tasks, total
    
    def update_status(
        self,
        task_id: uuid.UUID,
        status: TaskStatus,
        progress: float = None,
        message: str = None,
    ) -> Optional[Task]:
        """更新任务状态"""
        task = self.get_by_id(task_id)
        if not task:
            return None
        
        task.status = status.value if hasattr(status, 'value') else status
        
        if progress is not None:
            task.progress = progress
        if message is not None:
            task.message = message
        
        task.updated_at = datetime.utcnow()
        
        # 如果是终态，记录完成时间
        if status in [TaskStatus.FINISHED, TaskStatus.FAILED]:
            task.finished_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def update_progress(
        self,
        task_id: uuid.UUID,
        progress: float,
        message: str,
    ) -> Optional[Task]:
        """更新任务进度"""
        task = self.get_by_id(task_id)
        if not task:
            return None
        
        task.progress = progress
        task.message = message
        task.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def update_summary(self, task_id: uuid.UUID, summary: dict) -> Optional[Task]:
        """更新任务汇总结果"""
        task = self.get_by_id(task_id)
        if not task:
            return None
        
        task.summary = summary
        task.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def set_error(self, task_id: uuid.UUID, error_message: str) -> Optional[Task]:
        """设置任务错误"""
        task = self.get_by_id(task_id)
        if not task:
            return None
        
        task.status = TaskStatus.FAILED.value if hasattr(TaskStatus.FAILED, 'value') else TaskStatus.FAILED
        task.error_message = error_message
        task.message = "任务失败"
        task.finished_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def cancel(self, task_id: uuid.UUID) -> bool:
        """取消任务"""
        task = self.get_by_id(task_id)
        if not task:
            return False
        
        # 只有进行中的任务可以取消
        if task.is_final:
            return False
        
        task.status = TaskStatus.FAILED.value
        task.error_message = "用户取消"
        task.message = "任务已取消"
        task.finished_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return True
    
    def delete(self, task_id: uuid.UUID) -> bool:
        """删除任务"""
        task = self.get_by_id(task_id)
        if not task:
            return False
        
        self.db.delete(task)
        self.db.commit()
        
        return True
    
    def count(
        self,
        user_id: Optional[str] = None,
        status: Optional[TaskStatus] = None,
    ) -> int:
        """统计任务数量"""
        query = self.db.query(Task)
        
        if user_id:
            query = query.filter(Task.user_id == uuid.UUID(user_id))
        if status:
            query = query.filter(Task.status == status)
        
        return query.count()
