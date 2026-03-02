// 对账任务服务
import { prisma } from '../lib/db.js';
import { createError } from '../utils/error.js';
import { v4 as uuidv4 } from 'uuid';

// 任务状态类型
type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// 任务查询参数
export interface TaskQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  platformId?: string;
  status?: TaskStatus;
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt' | 'startDate';
  sortOrder?: 'asc' | 'desc';
}

// 创建任务参数
export interface CreateTaskParams {
  name: string;
  platformId: string;
  startDate: Date;
  endDate: Date;
  userId: string;
}

// 任务统计
export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalOrders: number;
  totalMatched: number;
  totalAmount: number;
}

/**
 * 获取任务列表（分页）
 */
export async function getTasks(params: TaskQueryParams, userId?: string, userRole?: string): Promise<unknown> {
  const {
    page = 1,
    pageSize = 10,
    keyword,
    platformId,
    status,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params;

  const where: Record<string, unknown> = {};

  // 非管理员只能查看自己的任务
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    where.userId = userId;
  }

  // 关键词搜索
  if (keyword) {
    where.name = { contains: keyword };
  }

  // 平台筛选
  if (platformId) {
    where.platformId = platformId;
  }

  // 状态筛选
  if (status) {
    where.status = status;
  }

  // 日期范围筛选
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      (where.createdAt as Record<string, Date>).gte = new Date(startDate);
    }
    if (endDate) {
      (where.createdAt as Record<string, Date>).lte = new Date(endDate);
    }
  }

  const [tasks, total] = await Promise.all([
    prisma.reconciliationTask.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, username: true },
        },
        _count: {
          select: { results: true },
        },
      },
    }),
    prisma.reconciliationTask.count({ where }),
  ]);

  return {
    data: tasks,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 获取任务详情
 */
export async function getTaskById(id: string): Promise<unknown> {
  const task = await prisma.reconciliationTask.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, username: true, email: true },
      },
      results: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!task) {
    throw createError('NOT_FOUND', '任务不存在');
  }

  return task;
}

/**
 * 创建任务
 */
export async function createTask(params: CreateTaskParams): Promise<unknown> {
  const { name, platformId, startDate, endDate, userId } = params;

  // 验证平台配置存在
  const platform = await prisma.platformConfig.findUnique({
    where: { platformId },
  });

  if (!platform) {
    throw createError('NOT_FOUND', '平台配置不存在');
  }

  // 验证用户存在
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw createError('NOT_FOUND', '用户不存在');
  }

  const task = await prisma.reconciliationTask.create({
    data: {
      id: uuidv4(),
      name,
      platformId,
      userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'PENDING',
    },
    include: {
      user: {
        select: { id: true, username: true },
      },
    },
  });

  return task;
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  extra?: {
    progress?: number;
    errorMessage?: string;
    localOrderCount?: number;
    platformOrderCount?: number;
    matchedCount?: number;
    exceptionCount?: number;
    totalAmount?: number;
    matchedAmount?: number;
  }
): Promise<unknown> {
  const task = await prisma.reconciliationTask.findUnique({ where: { id } });
  if (!task) {
    throw createError('NOT_FOUND', '任务不存在');
  }

  const updateData: Record<string, unknown> = { status };

  if (status === 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  if (extra) {
    if (extra.progress !== undefined) updateData.progress = extra.progress;
    if (extra.errorMessage !== undefined) updateData.errorMessage = extra.errorMessage;
    if (extra.localOrderCount !== undefined) updateData.localOrderCount = extra.localOrderCount;
    if (extra.platformOrderCount !== undefined) updateData.platformOrderCount = extra.platformOrderCount;
    if (extra.matchedCount !== undefined) updateData.matchedCount = extra.matchedCount;
    if (extra.exceptionCount !== undefined) updateData.exceptionCount = extra.exceptionCount;
    if (extra.totalAmount !== undefined) updateData.totalAmount = extra.totalAmount;
    if (extra.matchedAmount !== undefined) updateData.matchedAmount = extra.matchedAmount;
  }

  const updated = await prisma.reconciliationTask.update({
    where: { id },
    data: updateData,
    include: {
      user: {
        select: { id: true, username: true },
      },
    },
  });

  return updated;
}

/**
 * 删除任务
 */
export async function deleteTask(id: string): Promise<void> {
  const task = await prisma.reconciliationTask.findUnique({ where: { id } });
  if (!task) {
    throw createError('NOT_FOUND', '任务不存在');
  }

  // 删除任务会级联删除关联的结果和文件
  await prisma.reconciliationTask.delete({ where: { id } });
}

/**
 * 获取任务统计
 */
export async function getTaskStats(userId?: string, userRole?: string): Promise<TaskStats> {
  const where: Record<string, unknown> = {};
  
  // 非管理员只能查看自己的任务
  if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    where.userId = userId;
  }

  const [total, pending, processing, completed, failed] = await Promise.all([
    prisma.reconciliationTask.count({ where }),
    prisma.reconciliationTask.count({ where: { ...where, status: 'PENDING' } }),
    prisma.reconciliationTask.count({ where: { ...where, status: 'PROCESSING' } }),
    prisma.reconciliationTask.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.reconciliationTask.count({ where: { ...where, status: 'FAILED' } }),
  ]);

  // 获取已完成任务的订单统计
  const completedTasks = await prisma.reconciliationTask.findMany({
    where: { ...where, status: 'COMPLETED' },
    select: {
      localOrderCount: true,
      matchedCount: true,
      totalAmount: true,
      matchedAmount: true,
    },
  });

  const totalOrders = completedTasks.reduce((sum: number, t: typeof completedTasks[0]) => sum + t.localOrderCount, 0);
  const totalMatched = completedTasks.reduce((sum: number, t: typeof completedTasks[0]) => sum + t.matchedCount, 0);
  const totalAmount = completedTasks.reduce((sum: number, t: typeof completedTasks[0]) => sum + t.totalAmount, 0);

  return {
    total,
    pending,
    processing,
    completed,
    failed,
    totalOrders,
    totalMatched,
    totalAmount,
  };
}

/**
 * 获取任务结果详情
 */
export async function getTaskResults(taskId: string): Promise<unknown> {
  const task = await prisma.reconciliationTask.findUnique({
    where: { id: taskId },
    include: {
      results: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!task) {
    throw createError('NOT_FOUND', '任务不存在');
  }

  // 解析结果中的订单数据
  const results = task.results.map((r: typeof task.results[0]) => ({
    ...r,
    orders: JSON.parse(r.orders),
  }));

  return {
    ...task,
    results,
  };
}

/**
 * 获取月度统计
 */
export async function getMonthlyStats(year: number, month: number): Promise<unknown[]> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const tasks = await prisma.reconciliationTask.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { completedAt: 'asc' },
  });

  // 按日期分组统计
  const dailyStats: Record<string, {
    date: string;
    totalOrders: number;
    matchedOrders: number;
    exceptionOrders: number;
    matchRate: number;
    totalAmount: number;
  }> = {};

  tasks.forEach((task: typeof tasks[0]) => {
    const date = task.completedAt!.toISOString().split('T')[0];
    
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        totalOrders: 0,
        matchedOrders: 0,
        exceptionOrders: 0,
        matchRate: 0,
        totalAmount: 0,
      };
    }

    dailyStats[date].totalOrders += task.localOrderCount;
    dailyStats[date].matchedOrders += task.matchedCount;
    dailyStats[date].exceptionOrders += task.exceptionCount;
    dailyStats[date].totalAmount += task.totalAmount;
  });

  // 计算匹配率
  Object.values(dailyStats).forEach((stat) => {
    stat.matchRate = stat.totalOrders > 0 
      ? Math.round((stat.matchedOrders / stat.totalOrders) * 10000) / 100 
      : 0;
  });

  return Object.values(dailyStats);
}
