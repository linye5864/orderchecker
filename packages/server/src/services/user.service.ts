// 用户服务
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db.js';
import { createError } from '../utils/error.js';
import { validatePasswordStrength } from '../middleware/auth.js';

// 用户角色类型
type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

// 用户状态类型
type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';

// 用户查询参数
export interface UserQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: UserRole;
  status?: UserStatus;
  sortBy?: 'createdAt' | 'username' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

// 创建用户参数
export interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
}

// 更新用户参数
export interface UpdateUserParams {
  username?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
}

// 分页结果
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 获取用户列表（分页）
 */
export async function getUsers(params: UserQueryParams): Promise<PaginatedResult<unknown>> {
  const {
    page = 1,
    pageSize = 10,
    keyword,
    role,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params;

  const where: Record<string, unknown> = {};

  // 关键词搜索
  if (keyword) {
    where.OR = [
      { username: { contains: keyword } },
      { email: { contains: keyword } },
    ];
  }

  // 角色筛选
  if (role) {
    where.role = role;
  }

  // 状态筛选
  if (status) {
    where.status = status;
  }

  // 查询数据
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: { tasks: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 获取用户详情
 */
export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
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
 * 创建用户
 */
export async function createUser(params: CreateUserParams): Promise<unknown> {
  const { username, password, email, role = 'USER', status = 'ACTIVE' } = params;

  // 验证用户名
  if (username.length < 3 || username.length > 20) {
    throw createError('VALIDATION_ERROR', '用户名长度必须在3-20位之间');
  }

  // 验证密码
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    throw createError('VALIDATION_ERROR', passwordCheck.message);
  }

  // 检查用户名
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    throw createError('CONFLICT', '用户名已存在');
  }

  // 检查邮箱
  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
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
      status,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * 更新用户
 */
export async function updateUser(id: string, params: UpdateUserParams): Promise<unknown> {
  const { username, email, role, status, password } = params;

  // 检查用户是否存在
  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    throw createError('NOT_FOUND', '用户不存在');
  }

  // 检查用户名冲突
  if (username && username !== existingUser.username) {
    const usernameConflict = await prisma.user.findUnique({ where: { username } });
    if (usernameConflict) {
      throw createError('CONFLICT', '用户名已存在');
    }
  }

  // 检查邮箱冲突
  if (email && email !== existingUser.email) {
    const emailConflict = await prisma.user.findUnique({ where: { email } });
    if (emailConflict) {
      throw createError('CONFLICT', '邮箱已被注册');
    }
  }

  // 如果要更新密码，验证密码强度
  if (password) {
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      throw createError('VALIDATION_ERROR', passwordCheck.message);
    }
  }

  // 构建更新数据
  const updateData: Record<string, unknown> = {};
  if (username) updateData.username = username;
  if (email !== undefined) updateData.email = email;
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  if (password) updateData.password = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  return user;
}

/**
 * 删除用户
 */
export async function deleteUser(id: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw createError('NOT_FOUND', '用户不存在');
  }

  // 不能删除最后一个超级管理员
  if (user.role === 'SUPER_ADMIN') {
    const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (superAdminCount <= 1) {
      throw createError('PERMISSION_DENIED', '不能删除最后一个超级管理员');
    }
  }

  await prisma.user.delete({ where: { id } });
}

/**
 * 更新用户角色
 */
export async function updateUserRole(id: string, role: UserRole): Promise<unknown> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw createError('NOT_FOUND', '用户不存在');
  }

  // 不能修改超级管理员的角色
  if (user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
    throw createError('PERMISSION_DENIED', '不能修改超级管理员的角色');
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      username: true,
      role: true,
      updatedAt: true,
    },
  });

  return updatedUser;
}

/**
 * 获取角色列表
 */
export function getRoles(): { value: UserRole; label: string; description: string }[] {
  return [
    { value: 'SUPER_ADMIN', label: '超级管理员', description: '拥有所有权限' },
    { value: 'ADMIN', label: '管理员', description: '管理用户和系统配置' },
    { value: 'OPERATOR', label: '操作员', description: '执行对账操作' },
    { value: 'VIEWER', label: '只读用户', description: '仅能查看数据' },
  ];
}
