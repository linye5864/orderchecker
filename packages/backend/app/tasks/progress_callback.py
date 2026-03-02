"""
任务进度回调
用于在任务执行过程中更新进度并推送 WebSocket
"""

import asyncio
from typing import Optional, Callable
from datetime import datetime

from app.ws.manager import ws_manager


class TaskProgressCallback:
    """任务进度回调"""
    
    def __init__(self, task_id: str, status: str = "PROCESSING"):
        self.task_id = task_id
        self.status = status
        self.current_step = 0
        self.total_steps = 100
        self.message = ""
        self.extra = {}
    
    def set_total_steps(self, total: int):
        """设置总步数"""
        self.total_steps = max(1, total)
    
    def update(
        self,
        progress: float,
        message: str,
        extra: dict = None,
    ):
        """更新进度"""
        self.current_step = progress
        self.message = message
        if extra:
            self.extra.update(extra)
        
        # 广播进度
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(
                    ws_manager.broadcast_task_progress(
                        task_id=self.task_id,
                        status=self.status,
                        progress=progress,
                        message=message,
                        extra=extra,
                    )
                )
        except RuntimeError:
            # 没有事件循环，忽略
            pass
    
    def step(self, step_name: str, step_progress: int = None):
        """记录步骤"""
        if step_progress is not None:
            progress = step_progress
        else:
            progress = (self.current_step / self.total_steps) * 100
        
        self.update(progress, step_name)
    
    def phase(self, phase_name: str, phase_progress: float, extra: dict = None):
        """记录阶段完成"""
        self.update(phase_progress, phase_name, extra)
    
    def success(self, message: str = "任务完成"):
        """任务成功完成"""
        self.update(100.0, message, {"completed": True})
    
    def error(self, error_message: str):
        """任务执行错误"""
        self.update(0, f"错误: {error_message}", {"error": True})
    
    def info(self, message: str):
        """记录信息"""
        self.update(self.current_step, message, {"level": "info"})

    def warning(self, message: str):
        """记录警告"""
        self.update(self.current_step, message, {"level": "warning"})

    def debug(self, message: str):
        """记录调试信息"""
        self.update(self.current_step, message, {"level": "debug"})


class ProgressCallbackManager:
    """进度回调管理器"""
    
    _callbacks: dict = {}
    
    @classmethod
    def get_callback(cls, task_id: str) -> Optional[TaskProgressCallback]:
        """获取任务的回调实例"""
        return cls._callbacks.get(task_id)
    
    @classmethod
    def create_callback(cls, task_id: str, status: str = "PROCESSING") -> TaskProgressCallback:
        """为任务创建回调实例"""
        callback = TaskProgressCallback(task_id, status)
        cls._callbacks[task_id] = callback
        return callback
    
    @classmethod
    def remove_callback(cls, task_id: str):
        """移除任务的回调实例"""
        cls._callbacks.pop(task_id, None)
    
    @classmethod
    def clear(cls):
        """清空所有回调"""
        cls._callbacks.clear()


def create_progress_callback(task_id: str) -> TaskProgressCallback:
    """创建进度回调的便捷函数"""
    return ProgressCallbackManager.create_callback(task_id)


def get_progress_callback(task_id: str) -> Optional[TaskProgressCallback]:
    """获取进度回调的便捷函数"""
    return ProgressCallbackManager.get_callback(task_id)
