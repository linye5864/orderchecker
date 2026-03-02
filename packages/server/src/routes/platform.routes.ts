// 平台配置路由
import { Router } from 'express';
import * as platformController from '../controllers/platform.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 公开给所有认证用户的路由
router.get('/', platformController.getAllPlatforms);
router.get('/stats/overview', platformController.getPlatformStats);
router.get('/:id', platformController.getPlatformById);
router.put('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), platformController.updatePlatform);
router.post('/:id/sync', requireRole('OPERATOR', 'ADMIN', 'SUPER_ADMIN'), platformController.triggerSync);
router.post('/reset', requireRole('SUPER_ADMIN'), platformController.resetPlatforms);

export default router;
