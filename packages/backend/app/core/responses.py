"""
统一 API 响应格式
为所有 API 端点提供一致的响应包装
"""

from typing import Generic, TypeVar, Optional, Any, Dict
from pydantic import BaseModel, Field


class ApiResponse(BaseModel):
    """标准 API 响应格式"""
    success: bool = True
    code: int = 200
    message: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[str] = None


class PaginatedResponse(BaseModel):
    """分页响应格式"""
    success: bool = True
    code: int = 200
    data: list = Field(default_factory=list)
    pagination: Dict[str, int] = Field(default_factory=lambda: {
        "page": 1,
        "pageSize": 20,
        "total": 0,
        "totalPages": 0,
    })


def success(data: Any = None, message: str = None) -> Dict[str, Any]:
    """创建成功响应"""
    response = {
        "success": True,
        "code": 200,
    }
    if data is not None:
        response["data"] = data
    if message:
        response["message"] = message
    return response


def success_with_pagination(
    items: list,
    page: int,
    pageSize: int,
    total: int
) -> Dict[str, Any]:
    """创建分页成功响应"""
    return {
        "success": True,
        "code": 200,
        "data": items,
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "totalPages": (total + pageSize - 1) // pageSize,
        }
    }


def error(message: str, code: int = 400, error_detail: str = None) -> Dict[str, Any]:
    """创建错误响应"""
    response = {
        "success": False,
        "code": code,
        "message": message,
    }
    if error_detail:
        response["error"] = error_detail
    return response
