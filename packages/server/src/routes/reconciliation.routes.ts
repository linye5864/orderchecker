// 对账路由
import { Router } from 'express';
import * as reconciliationController from '../controllers/reconciliation.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * 执行对账
 * POST /api/v1/reconciliation/execute
 * 需要 OPERATOR 及以上权限
 */
router.post('/execute', requireRole('OPERATOR', 'ADMIN', 'SUPER_ADMIN'), reconciliationController.executeReconciliation);

/**
 * 获取对账结果
 * GET /api/v1/reconciliation/results/:taskId
 */
router.get('/results/:taskId', reconciliationController.getReconciliationResult);

/**
 * 获取对账进度
 * GET /api/v1/reconciliation/progress/:taskId
 */
router.get('/progress/:taskId', reconciliationController.getReconciliationProgress);

/**
 * 获取配送单平台汇总
 * POST /api/v1/reconciliation/platform-summary
 */
router.post('/platform-summary', reconciliationController.getPlatformSummary);

/**
 * 取消对账任务
 * POST /api/v1/reconciliation/cancel/:taskId
 * 需要 OPERATOR 及以上权限
 */
router.post('/cancel/:taskId', requireRole('OPERATOR', 'ADMIN', 'SUPER_ADMIN'), reconciliationController.cancelReconciliation);

/**
 * 获取对账历史
 * GET /api/v1/reconciliation/history
 */
router.get('/history', reconciliationController.getHistoryList);

/**
 * 获取对账历史统计
 * GET /api/v1/reconciliation/history/stats
 */
router.get('/history/stats', reconciliationController.getHistoryStats);

/**
 * 测试模式：直接执行对账（使用文件路径）
 * POST /api/v1/reconciliation/test/execute
 * 仅开发环境使用，不需要上传文件
 * 请求体: { localFilePath, platformFilePath, platformId, flowFilePath? }
 */
router.post('/test/execute', reconciliationController.testExecuteReconciliation);

export default router;
