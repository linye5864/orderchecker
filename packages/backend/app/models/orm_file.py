"""
上传文件模型 - SQLAlchemy ORM
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, String, Integer, DateTime, Enum, BigInteger
from app.core.database import Base
from app.core.guid import GUID


class FileType(str, Enum):
    """文件类型"""
    DELIVERY = "delivery"  # 配送单
    PLATFORM = "platform"  # 平台账单
    FLOW = "flow"  # 流水账单


class UploadedFile(Base):
    """上传文件表 - 存储文件元信息"""
    __tablename__ = "uploaded_files"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    
    # 文件信息
    original_filename = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)  # 存储的文件名
    file_path = Column(String(1000), nullable=False)
    file_size = Column(BigInteger, nullable=False)  # 字节大小
    file_type = Column(
        String(50),
        nullable=False,
        index=True,
    )
    mime_type = Column(String(100), default="application/octet-stream")
    
    # 文件状态
    is_processed = Column(Integer, default=0, nullable=False)  # 0=未处理, 1=已处理
    parse_error = Column(String(1000), nullable=True)
    
    # 解析结果 (JSON)
    parse_result = Column(String, nullable=True)
    
    # 上传者
    uploaded_by = Column(GUID(), nullable=True, index=True)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<UploadedFile(id={self.id}, filename={self.original_filename})>"
    
    @property
    def size_formatted(self) -> str:
        """格式化文件大小"""
        size = self.file_size
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.2f} {unit}"
            size /= 1024
        return f"{size:.2f} TB"
