// 平台配置控制器
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as platformService from '../services/platform.service.js';
import { success, reject } from '../utils/response.js';
import { AuthRequest } from '../middleware/auth.js';

// 更新平台配置验证 Schema
const updatePlatformSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  enabled: z.boolean().optional(),
  fieldMappings: z.array(z.object({
    localField: z.string(),
    platformField: z.string(),
    required: z.boolean(),
  })).optional(),
  tolerance: z.number().min(0).optional(),
  autoSync: z.boolean().optional(),
  syncInterval: z.number().min(5).max(1440).optional(),
});

/**
 * GET /api/v1/platforms
 * 获取所有平台配置
 */
export async function getAllPlatforms(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const platforms = await platformService.getAllPlatforms();
    res.json(success(platforms));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/platforms/:id
 * 获取单个平台配置
 */
export async function getPlatformById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const platform = await platformService.getPlatformById(id);
    res.json(success(platform));
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/platforms/:id
 * 更新平台配置
 */
export async function updatePlatform(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const parseResult = updatePlatformSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json(reject(parseResult.error.errors[0].message, 4001));
      return;
    }

    const data = parseResult.data;
    const platform = await platformService.updatePlatform(id, {
      name: data.name,
      icon: data.icon,
      enabled: data.enabled,
      fieldMappings: data.fieldMappings?.map(f => ({
        localField: f.localField || '',
        platformField: f.platformField || '',
        required: f.required || false,
      })),
      tolerance: data.tolerance,
      autoSync: data.autoSync,
      syncInterval: data.syncInterval,
    });
    res.json(success(platform, '平台配置更新成功'));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/platforms/:id/sync
 * 触发平台同步
 */
export async function triggerSync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const result = await platformService.triggerSync(id);
    res.json(success(result, result.message));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/platforms/stats/overview
 * 获取平台统计概览
 */
export async function getPlatformStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await platformService.getPlatformStats();
    res.json(success(stats));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/platforms/reset
 * 重置所有平台配置
 */
export async function resetPlatforms(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await platformService.resetPlatforms();
    res.json(success(null, '平台配置已重置为默认值'));
  } catch (err) {
    next(err);
  }
}
