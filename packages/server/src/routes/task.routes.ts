// 对账任务路由
import { Router } from 'express';
import * as taskController from '../controllers/task.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 任务列表和统计（所有角色可访问）
router.get('/', taskController.getTasks);
router.get('/stats', taskController.getTaskStats);
router.get('/stats/monthly', taskController.getMonthlyStats);

// 任务操作（需要操作员及以上权限）
router.post('/', requireRole('OPERATOR', 'ADMIN', 'SUPER_ADMIN'), taskController.createTask);
router.get('/:id', taskController.getTaskById);
router.delete('/:id', requireRole('OPERATOR', 'ADMIN', 'SUPER_ADMIN'), taskController.deleteTask);
router.get('/:id/results', taskController.getTaskResults);

export default router;
