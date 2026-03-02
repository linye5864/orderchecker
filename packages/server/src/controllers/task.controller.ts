// 对账任务控制器
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as taskService from '../services/task.service.js';
import { success, paginate, reject } from '../utils/response.js';
import { AuthRequest } from '../middleware/auth.js';

// 查询参数验证 Schema
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  keyword: z.string().optional(),
  platformId: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'startDate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// 创建任务验证 Schema
const createTaskSchema = z.object({
  name: z.string().min(1).max(100),
  platformId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

/**
 * GET /api/v1/tasks
 * 获取任务列表
 */
export async function getTasks(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const result = await taskService.getTasks(
      parseResult.data as Parameters<typeof taskService.getTasks>[0],
      req.user?.id,
      req.user?.role
    );

    const taskResult = result as { data: unknown[]; pagination: { page: number; pageSize: number; total: number } };

    res.json(paginate(
      taskResult.data,
      taskResult.pagination.page,
      taskResult.pagination.pageSize,
      taskResult.pagination.total
    ));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/tasks/stats
 * 获取任务统计
 */
export async function getTaskStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await taskService.getTaskStats(req.user?.id, req.user?.role);
    res.json(success(stats));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/tasks/stats/monthly
 * 获取月度统计
 */
export async function getMonthlyStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { year, month } = req.query;
    
    const y = year ? parseInt(year as string, 10) : new Date().getFullYear();
    const m = month ? parseInt(month as string, 10) : new Date().getMonth() + 1;

    const stats = await taskService.getMonthlyStats(y, m);
    res.json(success(stats));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/tasks/:id
 * 获取任务详情
 */
export async function getTaskById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const task = await taskService.getTaskById(id);
    res.json(success(task));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/tasks
 * 创建任务
 */
export async function createTask(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = createTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    if (!req.user) {
      res.status(401).json(reject('需要登录', 4002));
      return;
    }

    const taskData = parseResult.data;
    const task = await taskService.createTask({
      name: taskData.name,
      platformId: taskData.platformId,
      startDate: new Date(taskData.startDate),
      endDate: new Date(taskData.endDate),
      userId: req.user.id,
    });

    res.status(201).json(success(task, '任务创建成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/tasks/:id
 * 删除任务
 */
export async function deleteTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    await taskService.deleteTask(id);
    res.json(success(null, '任务删除成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/tasks/:id/results
 * 获取任务结果
 */
export async function getTaskResults(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const results = await taskService.getTaskResults(id);
    res.json(success(results));
  } catch (err) {
    next(err);
  }
}
