// 用户控制器
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as userService from '../services/user.service.js';
import { success, paginate, reject } from '../utils/response.js';
import { requireRole, AuthRequest } from '../middleware/auth.js';

// 用户角色类型
type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

// 用户状态类型
type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';

// 创建用户参数
interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
}

// 更新用户参数
interface UpdateUserParams {
  username?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
}

// 创建用户验证 Schema
const createUserSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(8),
  email: z.string().email().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
});

// 更新用户验证 Schema
const updateUserSchema = z.object({
  username: z.string().min(3).max(20).optional(),
  email: z.string().email().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
  password: z.string().min(8).optional(),
});

// 查询参数验证 Schema
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  keyword: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
  sortBy: z.enum(['createdAt', 'username', 'lastLoginAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * GET /api/v1/users
 * 获取用户列表
 */
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const params = parseResult.data;
    const result = await userService.getUsers(params as Parameters<typeof userService.getUsers>[0]);

    res.json(paginate(
      result.data,
      result.pagination.page,
      result.pagination.pageSize,
      result.pagination.total
    ));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/users/:id
 * 获取用户详情
 */
export async function getUserById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);
    res.json(success(user));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/users
 * 创建用户
 */
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const user = await userService.createUser(parseResult.data as CreateUserParams);
    res.status(201).json(success(user, '用户创建成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/users/:id
 * 更新用户
 */
export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const user = await userService.updateUser(id, parseResult.data as UpdateUserParams);
    res.json(success(user, '用户更新成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/users/:id
 * 删除用户
 */
export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    await userService.deleteUser(id);
    res.json(success(null, '用户删除成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/users/:id/role
 * 更新用户角色
 */
export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body as { role: UserRole };

    if (!role) {
      res.status(400).json(reject('角色不能为空', 4001));
      return;
    }

    const user = await userService.updateUserRole(id, role);
    res.json(success(user, '角色更新成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/users/roles
 * 获取角色列表
 */
export async function getRoles(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const roles = userService.getRoles();
    res.json(success(roles));
  } catch (err) {
    next(err);
  }
}
