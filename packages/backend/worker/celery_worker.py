"""
Celery Worker 配置
包含所有异步任务定义
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings


# 创建 Celery 实例
celery_app = Celery(
    "backend",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_URL,
    include=[
        "app.tasks.executor",
    ]
)

# Celery 配置
celery_app.conf.update(
    # 序列化
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # 时区
    timezone="Asia/Shanghai",
    enable_utc=True,
    
    # 任务执行配置
    task_track_started=True,
    task_time_limit=30 * 60,   # 30分钟硬超时
    task_soft_time_limit=25 * 60,  # 25分钟软超时
    worker_prefetch_multiplier=1,
    worker_concurrency=4,
    
    # 重试配置
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_disable_rate_limits=True,
    
    # 结果过期时间 (24小时)
    result_expires=60 * 60 * 24,
    
    # 任务路由
    task_routes={
        "tasks.run_reconciliation_task": {"queue": "reconciliation"},
    },
    
    # 定时任务 (可选)
    beat_schedule={},
)


@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """设置定时任务"""
    # 示例: 每天凌晨清理过期结果
    # sender.add_periodic_task(
    #     crontab(hour=0, minute=0),
    #     cleanup_expired_results.s(),
    # )
    pass


@celery_app.task(bind=True)
def debug_task(self):
    """调试任务"""
    print(f"Request: {self.request!r}")
    return "Debug task completed"
