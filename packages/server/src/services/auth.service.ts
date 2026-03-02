// 认证服务
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { generateToken, validatePasswordStrength } from '../middleware/auth.js';
import { createError } from '../utils/error.js';

// JWT Token payload
interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  email: string | null;
}

// 用户角色类型
type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

// 用户状态类型
type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';

// 登录参数
export interface LoginParams {
  username: string;
  password: string;
}

// 登录结果
export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    role: UserRole;
    status: UserStatus;
  };
}

// 注册参数
export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  role?: UserRole;
}

/**
 * 用户登录
 */
export async function login(params: LoginParams): Promise<LoginResult> {
  const { username, password } = params;

  // 查找用户
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    throw createError('AUTH_INVALID', '用户名或密码错误');
  }

  if (user.status !== 'ACTIVE') {
    throw createError('AUTH_INVALID', '账户已被禁用');
  }

  // 验证密码
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw createError('AUTH_INVALID', '用户名或密码错误');
  }

  // 生成 JWT Token
  const tokenPayload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
  };
  const token = generateToken(tokenPayload);

  // 创建会话
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7天过期

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
      userIp: undefined,
      userAgent: undefined,
    },
  });

  // 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
    },
  };
}

/**
 * 用户注册
 */
export async function register(params: RegisterParams): Promise<LoginResult> {
  const { username, password, email, role = 'USER' } = params;

  // 验证用户名格式
  if (username.length < 3 || username.length > 20) {
    throw createError('VALIDATION_ERROR', '用户名长度必须在3-20位之间');
  }

  // 验证密码强度
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    throw createError('VALIDATION_ERROR', passwordCheck.message);
  }

  // 检查用户名是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    throw createError('CONFLICT', '用户名已存在');
  }

  // 检查邮箱是否已存在（如果提供了邮箱）
  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw createError('CONFLICT', '邮箱已被注册');
    }
  }

  // 加密密码
  const hashedPassword = await bcrypt.hash(password, 12);

  // 创建用户
  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      email,
      role,
      status: 'ACTIVE',
    },
  });

  // 生成 Token
  const tokenPayload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
  };
  const token = generateToken(tokenPayload);

  // 创建会话
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
    },
  };
}

/**
 * 用户登出
 */
export async function logout(token: string): Promise<void> {
  // 删除会话
  await prisma.session.deleteMany({
    where: { token },
  });
}

/**
 * 刷新 Token
 */
export async function refreshToken(oldToken: string): Promise<string> {
  // 验证旧 Token
  const session = await prisma.session.findUnique({
    where: { token: oldToken },
    include: { user: true },
  });

  if (!session) {
    throw createError('AUTH_INVALID', '会话已失效');
  }

  if (new Date() > session.expiresAt) {
    await prisma.session.delete({ where: { id: session.id } });
    throw createError('AUTH_INVALID', '会话已过期');
  }

  // 生成新 Token
  const newToken = generateToken({
    userId: session.user.id,
    username: session.user.username,
    role: session.user.role,
    email: session.user.email,
  });

  // 更新会话
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      token: newToken,
      expiresAt,
    },
  });

  return newToken;
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      _count: {
        select: {
          tasks: true,
          sessions: true,
        },
      },
    },
  });

  if (!user) {
    throw createError('NOT_FOUND', '用户不存在');
  }

  return user;
}

/**
 * 批量删除过期会话
 */
export async function cleanExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * 验证 Token 是否有效
 */
export async function validateToken(token: string): Promise<TokenPayload | null> {
  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session || new Date() > session.expiresAt) {
    return null;
  }

  return null; // 实际返回需要从数据库获取用户信息
}
