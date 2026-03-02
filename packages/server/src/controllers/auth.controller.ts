// 认证控制器
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { success, reject } from '../utils/response.js';
import type { AuthRequest } from '../middleware/auth.js';

// 登录请求验证 Schema
const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6),
});

// 注册请求验证 Schema
const registerSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8),
  email: z.string().email().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER']).optional(),
});

/**
 * POST /api/v1/auth/login
 * 用户登录
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 验证请求参数
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const { username, password } = parseResult.data;

    // 执行登录
    const result = await authService.login({ username, password });

    res.json(success(result, '登录成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/register
 * 用户注册
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 验证请求参数
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const { username, password, email, role } = parseResult.data;

    // 执行注册
    const result = await authService.register({ username, password, email, role });

    res.status(201).json(success(result, '注册成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * 用户登出
 */
export async function logout(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await authService.logout(token);
    }

    res.json(success(null, '登出成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/refresh
 * 刷新 Token
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(reject('未提供认证令牌', 4002));
      return;
    }

    const token = authHeader.substring(7);
    const newToken = await authService.refreshToken(token);

    res.json(success({ token: newToken }, 'Token 已刷新'));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * 获取当前用户信息
 */
export async function getCurrentUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json(reject('需要登录', 4002));
      return;
    }

    const user = await authService.getCurrentUser(req.user.id);
    res.json(success(user));
  } catch (err) {
    next(err);
  }
}
