/**
 * 文件管理路由
 * 集成智能上传功能
 */

import { Router } from 'express';
import multer from 'multer';
import * as fileController from '../controllers/file.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { CONFIG } from '../services/smart-upload.service.js';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 配置 multer（与后端服务配置保持一致）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,  // 50MB
    files: 10,                        // 单次最多10个文件
  },
  fileFilter: (req, file, cb) => {
    // 文件类型验证
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式，仅支持: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

/**
 * 获取上传配置和状态
 * GET /api/v1/files/upload/status
 */
router.get('/upload/status', fileController.getUploadStatus);

/**
 * 验证文件（不实际上传）
 * POST /api/v1/files/upload/validate
 */
router.post('/upload/validate', upload.array('file', 10), fileController.validateFile);

/**
 * 上传文件
 * POST /api/v1/files/upload
 */
router.post('/upload', upload.array('file', 10), fileController.uploadFile);

/**
 * 批量上传
 * POST /api/v1/files/upload/batch
 */
router.post('/upload/batch', upload.array('file', 10), fileController.uploadBatch);

/**
 * 获取文件列表
 * GET /api/v1/files?kind=LOCAL|PLATFORM|FLOW&page=1&pageSize=50&search=关键词
 */
router.get('/', fileController.getFiles);

/**
 * 获取单个文件
 * GET /api/v1/files/:id
 */
router.get('/:id', fileController.getFileById);

/**
 * 删除文件
 * DELETE /api/v1/files/:id
 */
router.delete('/:id', fileController.deleteFile);

/**
 * 批量删除文件
 * DELETE /api/v1/files
 * Body: { ids: string[] }
 */
router.delete('/', fileController.deleteFiles);

export default router;
