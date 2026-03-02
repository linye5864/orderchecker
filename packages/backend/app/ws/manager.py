"""
WebSocket 连接管理器
负责 WebSocket 连接的建立、消息推送和断开
"""

import json
import logging
from typing import Dict, Set
from datetime import datetime

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket 连接管理器"""
    
    def __init__(self):
        # task_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # connection -> set of task_ids subscribed
        self.connection_tasks: Dict[WebSocket, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, task_id: str = None):
        """建立 WebSocket 连接"""
        await websocket.accept()
        
        if websocket not in self.connection_tasks:
            self.connection_tasks[websocket] = set()
        
        if task_id:
            await self.subscribe(websocket, task_id)
        
        logger.info(f"WebSocket connected, task_id={task_id}")
    
    async def disconnect(self, websocket: WebSocket):
        """断开 WebSocket 连接"""
        # 从所有订阅的任务中移除
        for task_id in self.connection_tasks.get(websocket, set()):
            if task_id in self.active_connections:
                self.active_connections[task_id].discard(websocket)
                # 清理空的任务订阅
                if not self.active_connections[task_id]:
                    del self.active_connections[task_id]
        
        self.connection_tasks.pop(websocket, None)
        logger.info("WebSocket disconnected")
    
    async def subscribe(self, websocket: WebSocket, task_id: str):
        """订阅任务进度更新"""
        if task_id not in self.active_connections:
            self.active_connections[task_id] = set()
        self.active_connections[task_id].add(websocket)
        self.connection_tasks[websocket].add(task_id)
        logger.info(f"Subscribed to task: {task_id}")
    
    async def unsubscribe(self, websocket: WebSocket, task_id: str):
        """取消订阅任务"""
        if task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
        
        if websocket in self.connection_tasks:
            self.connection_tasks[websocket].discard(task_id)
        logger.info(f"Unsubscribed from task: {task_id}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """发送个人消息"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
    async def broadcast_to_task(self, task_id: str, message: dict):
        """向订阅特定任务的所有连接广播消息"""
        if task_id not in self.active_connections:
            return
        
        connections = self.active_connections[task_id].copy()
        disconnected = []
        
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to connection: {e}")
                disconnected.append(websocket)
        
        # 清理断开的连接
        for websocket in disconnected:
            await self.disconnect(websocket)
    
    async def broadcast_task_progress(
        self,
        task_id: str,
        status: str,
        progress: float,
        message: str,
        extra: dict = None
    ):
        """广播任务进度更新"""
        payload = {
            "type": "task_progress",
            "task_id": task_id,
            "status": status,
            "progress": round(progress, 2),
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if extra:
            payload.update(extra)
        
        await self.broadcast_to_task(task_id, payload)
        logger.info(f"Task progress broadcasted: task_id={task_id}, status={status}, progress={progress}")


# 全局 WebSocket 管理器实例
ws_manager = ConnectionManager()
