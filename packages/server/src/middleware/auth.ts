// JWT 认证中间件
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/db.js';
import { createError } from '../utils/error.js';
import { reject } from '../utils/response.js';
import { env } from '../config/index.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    email: string | null;
  };
}

/**
 * JWT Token payload
 */
interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  email: string | null;
  iat?: number;
  exp?: number;
}

/**
 * 认证中间件
 * 验证请求中的 JWT Token
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 从 Header 获取 Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(reject('未提供认证令牌', 4002));
      return;
    }

    const token = authHeader.substring(7);

    // 验证 Token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json(reject('Token 已过期', 4003));
        return;
      }
      res.status(401).json(reject('无效的认证令牌', 4003));
      return;
    }

    // 检查会话是否在数据库中存在
    const session = await prisma.session.findUnique({
      where: { token },
    });

    if (!session) {
      res.status(401).json(reject('会话已失效', 4003));
      return;
    }

    // 检查会话是否过期
    if (new Date() > session.expiresAt) {
      await prisma.session.delete({ where: { id: session.id } });
      res.status(401).json(reject('会话已过期', 4003));
      return;
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 可选认证中间件
 * 如果提供了 Token 则验证，否则继续（用于公开路由）
 */
export async function optionalAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      const session = await prisma.session.findUnique({
        where: { token },
      });

      if (session && new Date() <= session.expiresAt) {
        req.user = {
          id: payload.userId,
          username: payload.username,
          role: payload.role,
          email: payload.email,
        };
      }
    } catch {
      // Token 无效时不报错，继续执行
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 角色权限中间件工厂
 * @param allowedRoles 允许的角色列表
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(reject('需要登录', 4002));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json(reject('权限不足', 4004));
      return;
    }

    next();
  };
}

/**
 * 生成 JWT Token
 */
export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * 验证密码强度
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: '密码长度至少8位' };
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含字母' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码必须包含数字' };
  }

  return { valid: true, message: '密码强度符合要求' };
}
