// 统一响应格式

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 成功响应
export function success<T>(data?: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

// 分页响应
export function paginate<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// 错误响应
export function error(message: string, code?: number): ApiResponse {
  return {
    success: false,
    message,
    error: message,
    code,
  };
}

// 拒绝响应（用于中间件）
export function reject<T>(message: string, code?: number): ApiResponse<T> {
  return {
    success: false,
    message,
    error: message,
    code,
  };
}
