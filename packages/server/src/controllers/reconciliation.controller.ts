/**
 * Reconciliation Task Controller
 * API endpoints for reconciliation task management
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as reconciliationService from '../services/reconciliation.service.js';
import { createWebSocketProgressCallback } from '../services/websocket.service.js';
import { 
  getReconciliationTaskById, 
  updateReconciliationTask, 
  getReconciliationHistory as getHistoryFromDb, 
  getReconciliationHistoryStats as getHistoryStatsFromDb 
} from '../lib/sqlite.js';
import { success, reject } from '../utils/response.js';

// ============================================================================
// Validation Schemas
// ============================================================================

const executeSchema = z.object({
  name: z.string().min(1, '任务名称').optional(),
  localFileId: z.string().uuid('必须提供本地文件ID'),
  platformFileId: z.string().uuid('必须提供平台文件ID'),
  fundFileId: z.string().uuid('可选：流水账单文件ID').optional(),
  platformId: z.enum(['shansong', 'dada', 'fengniao', 'xunfeng', 'xunfeng-c', 'guoxiaodi', 'uu']),
  tolerance: z.number().min(0).default(0.01),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const taskIdSchema = z.object({
  taskId: z.string().min(1),
});

const platformSummarySchema = z.object({
  fileId: z.string().uuid('必须提供文件ID'),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * Execute reconciliation task
 * POST /api/v1/reconciliation/execute
 */
export async function executeReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      name,
      localFileId,
      platformFileId,
      fundFileId,
      platformId,
      tolerance,
      start_date,
      end_date,
    } = executeSchema.parse(req.body);

    // Generate task ID
    const taskId = `REC-${Date.now()}`;

    // Create WebSocket progress callback
    const wsProgressCallback = createWebSocketProgressCallback(taskId);

    // Start reconciliation asynchronously
    reconciliationService.executeReconciliation({
      taskId,
      localFileId,
      platformFileId,
      flowFileId: fundFileId,
      platformId,
      tolerance,
      onProgress: (progress, message) => {
        // Update WebSocket clients
        wsProgressCallback(progress, message);
        
        // Also log to console
        console.log(`[${taskId}] Progress: ${progress}% - ${message}`);
      },
    }).then(async (result) => {
      // Task completed successfully
      wsProgressCallback(100, '对账完成');
      console.log(`[${taskId}] Reconciliation completed`);
    }).catch(async (error) => {
      // Task failed
      console.error(`[${taskId}] Reconciliation failed:`, error);
    });

    res.json(success({
      taskId,
      message: '对账任务已启动',
    }, '对账任务已创建'));
  } catch (err) {
    console.error('Execute reconciliation error:', err);
    next(err);
  }
}

/**
 * Get reconciliation result
 * GET /api/v1/reconciliation/results/:taskId
 */
export async function getReconciliationResult(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { taskId } = req.params;

    // For now, return a placeholder response
    // In a real implementation, this would fetch from the results table
    res.json(success({
      taskId,
      status: 'PROCESSING',
      message: '对账任务正在处理中',
    }));
  } catch (err) {
    console.error('Get reconciliation result error:', err);
    next(err);
  }
}

/**
 * Get reconciliation progress
 * GET /api/v1/reconciliation/progress/:taskId
 */
export async function getReconciliationProgress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { taskId } = req.params;

    // 获取实时进度（从内存存储）
    const progress = reconciliationService.getTaskProgress(taskId);

    if (progress) {
      res.json(success({
        taskId,
        status: progress.status,
        progress: progress.progress,
        message: progress.message,
      }));
    } else {
      // 如果内存中没有，从数据库查询
      const task = await getReconciliationTaskById(taskId);
      if (task) {
        res.json(success({
          taskId,
          status: task.status,
          progress: task.progress,
          message: task.status === 'COMPLETED' ? '对账已完成' : 
                   task.status === 'FAILED' ? '对账失败' :
                   task.status === 'CANCELLED' ? '任务已取消' : '对账任务正在处理中',
        }));
      } else {
        res.json(success({
          taskId,
          status: 'PENDING',
          progress: 0,
          message: '对账任务未找到',
        }));
      }
    }
  } catch (err) {
    console.error('Get reconciliation progress error:', err);
    next(err);
  }
}

/**
 * Cancel reconciliation task
 * POST /api/v1/reconciliation/cancel/:taskId
 */
export async function cancelReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { taskId } = req.params;

    // 检查任务是否存在
    const task = await getReconciliationTaskById(taskId);
    if (!task) {
      res.status(404).json(reject('任务不存在'));
      return;
    }

    // 检查任务状态
    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
      res.status(400).json(reject(`无法取消任务，当前状态：${task.status}`));
      return;
    }

    // 设置取消状态
    reconciliationService.setTaskCancellation(taskId, true);

    // 更新任务状态为已取消
    await updateReconciliationTask(taskId, {
      status: 'CANCELLED',
      errorMessage: '用户取消任务',
    });

    res.json(success({
      taskId,
      message: '任务已取消',
    }, '任务已取消'));
  } catch (err) {
    console.error('Cancel reconciliation error:', err);
    next(err);
  }
}

/**
 * Get platform summary from file
 * POST /api/v1/reconciliation/platform-summary
 */
export async function getPlatformSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileId } = platformSummarySchema.parse(req.body);

    // For now, return a placeholder response
    // In a real implementation, this would parse the file and summarize
    res.json(success({
      message: '平台汇总功能正在开发中',
      fileId,
    }));
  } catch (err) {
    console.error('Get platform summary error:', err);
    next(err);
  }
}

/**
 * Get reconciliation history
 * GET /api/v1/reconciliation/history
 */
export async function getHistoryList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const status = req.query.status as string || 'all';
    const platformId = req.query.platformId as string || undefined;
    const startDate = req.query.startDate as string || undefined;
    const endDate = req.query.endDate as string || undefined;
    const search = req.query.search as string || undefined;

    const result = getHistoryFromDb(page, pageSize, {
      status,
      platformId,
      startDate,
      endDate,
      search,
    });

    res.json(success(result));
  } catch (err) {
    console.error('Get reconciliation history error:', err);
    next(err);
  }
}

/**
 * Get reconciliation history statistics
 * GET /api/v1/reconciliation/history/stats
 */
export async function getHistoryStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = getHistoryStatsFromDb();
    res.json(success(stats));
  } catch (err) {
    console.error('Get reconciliation history stats error:', err);
    next(err);
  }
}

/**
 * 测试模式：直接执行对账（使用文件路径）
 * POST /api/v1/reconciliation/test/execute
 * 仅开发环境使用
 * 请求体: { localFilePath, platformFilePath, platformId, flowFilePath? }
 */
export async function testExecuteReconciliation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { localFilePath, platformFilePath, platformId, flowFilePath } = req.body;

    if (!localFilePath || !platformFilePath) {
      res.status(400).json(reject('必须提供 localFilePath 和 platformFilePath'));
      return;
    }

    // 生成测试用的 taskId
    const taskId = `TEST-${Date.now()}`;

    console.log(`[TEST] 开始测试对账任务 ${taskId}`);
    console.log(`[TEST] 配送单: ${localFilePath}`);
    console.log(`[TEST] 平台账单: ${platformFilePath}`);
    if (flowFilePath) {
      console.log(`[TEST] 流水账单: ${flowFilePath}`);
    }
    console.log(`[TEST] 平台ID: ${platformId}`);

    // 同步执行对账（测试模式直接等待完成）
    try {
      const result = await reconciliationService.executeReconciliationSync({
        taskId,
        localFilePath,
        platformFilePath,
        flowFilePath,
        platformId: platformId || 'shansong',
        tolerance: 0.01,
        onProgress: (progress, message) => {
          console.log(`[TEST-${taskId}] Progress: ${progress}% - ${message}`);
        },
      });

      console.log(`[TEST] 对账完成:`, result);

      res.json(success({
        taskId,
        status: 'COMPLETED',
        results: {
          totalOrders: result.totalOrders,
          matchedOrders: result.matchedOrders,
          exceptionOrders: result.exceptionOrders,
          missingOrders: result.missingOrders,
          matchRate: result.matchRate,
          amountDiff: result.amountDiff,
          totalLocalAmount: result.totalLocalAmount,
          totalPlatformAmount: result.totalPlatformAmount,
          details: result.details.slice(0, 100), // 限制返回的详情数量
        },
      }, '测试对账完成'));
    } catch (error: any) {
      console.error(`[TEST] 对账失败:`, error);
      
      // 如果是"数据为空"错误，返回更详细的错误信息
      if (error.code === 4001 && error.message?.includes('数据为空')) {
        res.status(400).json(reject(`文件解析失败或数据为空。请检查文件格式和内容。错误详情: ${error.message}`));
      } else {
        res.status(400).json(reject(`对账失败: ${error.message || '未知错误'}`));
      }
    }
  } catch (err) {
    console.error('Test execute reconciliation error:', err);
    next(err);
  }
}
