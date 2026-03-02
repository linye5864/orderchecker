// 认证路由
import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';

const router = Router();

// 公开路由
router.post('/login', authController.login);
router.post('/register', authController.register);

// 需要认证的路由
router.post('/logout', authMiddleware, authController.logout);
router.post('/refresh', optionalAuthMiddleware, authController.refresh);
router.get('/me', authMiddleware, authController.getCurrentUser);

export default router;
