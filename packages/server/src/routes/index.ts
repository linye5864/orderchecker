// 路由聚合
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import platformRoutes from './platform.routes.js';
import taskRoutes from './task.routes.js';
import fileRoutes from './file.routes.js';
import reconciliationRoutes from './reconciliation.routes.js';

const router = Router();

// API 版本前缀
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/platforms', platformRoutes);
router.use('/tasks', taskRoutes);
router.use('/files', fileRoutes);
router.use('/reconciliation', reconciliationRoutes);

// 健康检查
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
