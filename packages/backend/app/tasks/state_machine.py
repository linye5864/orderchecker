"""
任务状态机
定义任务状态的流转逻辑
"""

from enum import Enum
from typing import Dict, Set, Optional


class TaskStatus(str, Enum):
    """任务状态"""
    INIT = "INIT"             # 初始化
    UPLOADED = "UPLOADED"     # 文件上传完成
    PARSING = "PARSING"       # Excel 解析中
    NORMALIZING = "NORMALIZING"  # 数据标准化
    MATCHING = "MATCHING"     # 对账匹配
    AGGREGATING = "AGGREGATING"  # 汇总统计
    FINISHED = "FINISHED"     # 成功完成
    FAILED = "FAILED"         # 失败


class TransitionError(Exception):
    """状态转换错误"""
    pass


class TaskStateMachine:
    """任务状态机"""
    
    # 有效状态转换
    TRANSITIONS: Dict[TaskStatus, Set[TaskStatus]] = {
        TaskStatus.INIT: {TaskStatus.UPLOADED, TaskStatus.FAILED},
        TaskStatus.UPLOADED: {TaskStatus.PARSING, TaskStatus.FAILED},
        TaskStatus.PARSING: {TaskStatus.NORMALIZING, TaskStatus.MATCHING, TaskStatus.FAILED},
        TaskStatus.NORMALIZING: {TaskStatus.MATCHING, TaskStatus.FAILED},
        TaskStatus.MATCHING: {TaskStatus.AGGREGATING, TaskStatus.FINISHED, TaskStatus.FAILED},
        TaskStatus.AGGREGATING: {TaskStatus.FINISHED, TaskStatus.FAILED},
        TaskStatus.FINISHED: set(),  # 终态
        TaskStatus.FAILED: set(),    # 终态
    }
    
    # 终态
    FINAL_STATES: Set[TaskStatus] = {TaskStatus.FINISHED, TaskStatus.FAILED}
    
    @classmethod
    def can_transition(cls, from_status: TaskStatus, to_status: TaskStatus) -> bool:
        """检查是否可以从 from_status 转换到 to_status"""
        # 允许相同状态的转换（用于进度更新）
        if from_status == to_status:
            return True
            
        allowed = cls.TRANSITIONS.get(from_status, set())
        return to_status in allowed
    
    @classmethod
    def validate_transition(cls, from_status: TaskStatus, to_status: TaskStatus) -> None:
        """验证状态转换，无效则抛出异常"""
        if not cls.can_transition(from_status, to_status):
            from_val = getattr(from_status, 'value', str(from_status))
            to_val = getattr(to_status, 'value', str(to_status))
            raise TransitionError(
                f"无效的状态转换: {from_val} -> {to_val}"
            )
    
    @classmethod
    def is_final(cls, status: TaskStatus) -> bool:
        """是否为终态"""
        return status in cls.FINAL_STATES
    
    @classmethod
    def get_next_states(cls, status: TaskStatus) -> Set[TaskStatus]:
        """获取可以从当前状态转换到的所有状态"""
        return cls.TRANSITIONS.get(status, set())
    
    @classmethod
    def get_description(cls, status: TaskStatus) -> str:
        """获取状态描述"""
        descriptions = {
            TaskStatus.INIT: "初始化",
            TaskStatus.UPLOADED: "文件上传完成",
            TaskStatus.PARSING: "Excel 解析中",
            TaskStatus.NORMALIZING: "数据标准化",
            TaskStatus.MATCHING: "对账匹配",
            TaskStatus.AGGREGATING: "汇总统计",
            TaskStatus.FINISHED: "成功完成",
            TaskStatus.FAILED: "失败",
        }
        return descriptions.get(status, "未知状态")
