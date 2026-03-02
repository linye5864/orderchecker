// 全局错误处理中间件
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES } from '../utils/error.js';

// PrismaClientKnownRequestError type
interface PrismaError extends Error {
  code: string;
}

/**
 * 错误类型分类
 */
interface ErrorResponse {
  success: boolean;
  message: string;
  code: number;
  errorType?: string;
  details?: unknown;
}

/**
 * 错误格式化
 */
function formatError(err: unknown): ErrorResponse {
  // Prisma 错误
  const prismaErr = err as PrismaError;
  if (prismaErr && prismaErr.code) {
    if (prismaErr.code === 'P2002') {
      return {
        success: false,
        message: '资源已存在',
        code: 4006,
        errorType: 'CONFLICT',
      };
    }
    if (prismaErr.code === 'P2025') {
      return {
        success: false,
        message: '资源不存在',
        code: 4005,
        errorType: 'NOT_FOUND',
      };
    }
    return {
      success: false,
      message: '数据库操作失败',
      code: 5002,
      errorType: 'DATABASE_ERROR',
    };
  }

  // Zod 验证错误
  if (err instanceof ZodError) {
    return {
      success: false,
      message: '参数验证失败',
      code: 4001,
      errorType: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  // 应用自定义错误
  if (err instanceof AppError) {
    return {
      success: false,
      message: err.message,
      code: err.code,
      errorType: ERROR_CODES[err.code] || 'UNKNOWN',
    };
  }

  // 其他未知错误
  console.error('Unexpected error:', err);
  return {
    success: false,
    message: process.env.NODE_ENV === 'development' 
      ? (err instanceof Error ? err.message : '未知错误')
      : '服务器内部错误',
    code: 5001,
    errorType: 'INTERNAL_ERROR',
  };
}

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorResponse = formatError(err);

  // 记录错误日志
  if (errorResponse.code >= 500) {
    console.error('Server Error:', {
      message: errorResponse.message,
      stack: err instanceof Error ? err.stack : undefined,
      path: req.path,
      method: req.method,
    });
  }

  // 使用正确的 HTTP 状态码: AppError 有 statusCode 属性，其他错误使用映射
  let httpStatus: number;
  if (err instanceof AppError) {
    httpStatus = err.statusCode;
  } else if (errorResponse.code >= 400 && errorResponse.code < 600) {
    // 对于 Prisma 和 Zod 错误，使用 code 作为 HTTP 状态码（因为已设置为 4xx/5xx）
    httpStatus = errorResponse.code;
  } else {
    httpStatus = 500;
  }

  res.status(httpStatus).json(errorResponse);
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `路由 ${req.method} ${req.path} 不存在`,
    code: 4005,
    errorType: 'NOT_FOUND',
  });
}
