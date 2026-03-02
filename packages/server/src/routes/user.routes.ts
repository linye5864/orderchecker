// 用户路由
import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 公开给所有认证用户的路由
router.get('/roles', userController.getRoles);

// 需要管理员权限的路由
router.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), userController.getUsers);
router.post('/', requireRole('SUPER_ADMIN'), userController.createUser);
router.get('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), userController.getUserById);
router.put('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), userController.updateUser);
router.delete('/:id', requireRole('SUPER_ADMIN'), userController.deleteUser);
router.put('/:id/role', requireRole('SUPER_ADMIN'), userController.updateUserRole);

export default router;
