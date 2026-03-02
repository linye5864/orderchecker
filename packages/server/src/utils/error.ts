// 自定义错误类

export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: number = 500, statusCode: number = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 错误类型定义
export const ErrorTypes = {
  VALIDATION_ERROR: { code: 4001, statusCode: 400, message: '参数验证失败' },
  AUTH_REQUIRED: { code: 4002, statusCode: 401, message: '需要登录' },
  AUTH_INVALID: { code: 4003, statusCode: 401, message: '认证无效' },
  PERMISSION_DENIED: { code: 4004, statusCode: 403, message: '权限不足' },
  NOT_FOUND: { code: 4005, statusCode: 404, message: '资源不存在' },
  CONFLICT: { code: 4006, statusCode: 409, message: '资源冲突' },
  INTERNAL_ERROR: { code: 5001, statusCode: 500, message: '服务器内部错误' },
  DATABASE_ERROR: { code: 5002, statusCode: 500, message: '数据库错误' },
  RATE_LIMIT: { code: 5003, statusCode: 429, message: '请求过于频繁' },
  CANCELLED: { code: 4007, statusCode: 400, message: '任务已取消' },
} as const;

// 创建错误工厂函数
export function createError(type: keyof typeof ErrorTypes, message?: string): AppError {
  const errorType = ErrorTypes[type];
  return new AppError(
    message || errorType.message,
    errorType.code,
    errorType.statusCode
  );
}

// 错误码映射
export const ERROR_CODES: Record<number, string> = {
  4001: 'VALIDATION_ERROR',
  4002: 'AUTH_REQUIRED',
  4003: 'AUTH_INVALID',
  4004: 'PERMISSION_DENIED',
  4005: 'NOT_FOUND',
  4006: 'CONFLICT',
  5001: 'INTERNAL_ERROR',
  5002: 'DATABASE_ERROR',
  5003: 'RATE_LIMIT',
  4007: 'CANCELLED',
};
