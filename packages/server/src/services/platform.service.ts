// 平台配置服务
import { prisma } from '../lib/db.js';
import { createError } from '../utils/error.js';

// 字段映射类型
interface FieldMapping {
  localField: string;
  platformField: string;
  required: boolean;
}

// 默认平台配置
const defaultPlatforms = [
  {
    platformId: 'shansong',
    name: '闪送',
    icon: '📦',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'dada',
    name: '达达',
    icon: '🚴',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'fengniao',
    name: '蜂鸟',
    icon: '🐦',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'xunfeng',
    name: '顺丰同城',
    icon: '✈️',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'xunfeng-c',
    name: '顺丰企业C',
    icon: '🏢',
    enabled: false,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: false,
    syncInterval: 15,
  },
  {
    platformId: 'guoxiaodi',
    name: '裹小递',
    icon: '📱',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'uu',
    name: 'UU跑腿',
    icon: '🏃',
    enabled: true,
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
];

// 平台配置参数
export interface PlatformConfigParams {
  name?: string;
  icon?: string;
  enabled?: boolean;
  fieldMappings?: FieldMapping[];
  tolerance?: number;
  autoSync?: boolean;
  syncInterval?: number;
  apiConfig?: Record<string, unknown>;
}

/**
 * 获取所有平台配置
 */
export async function getAllPlatforms(): Promise<unknown[]> {
  const platforms = await prisma.platformConfig.findMany({
    orderBy: { createdAt: 'asc' },
  });

  // 如果没有数据，初始化默认配置
  if (platforms.length === 0) {
    await initializePlatforms();
    return getAllPlatforms();
  }

  return platforms.map((p: typeof platforms[0]) => ({
    ...p,
    fieldMappings: JSON.parse(p.fieldMappings),
    apiConfig: p.apiConfig ? JSON.parse(p.apiConfig) : null,
  }));
}

/**
 * 获取单个平台配置
 * @param id - 可以是数据库记录ID (UUID) 或平台标识符 (如 'shansong')
 */
export async function getPlatformById(id: string): Promise<unknown> {
  // 判断是 UUID 还是平台标识符
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  let platform;
  if (isUuid) {
    // 按 UUID 查询
    platform = await prisma.platformConfig.findUnique({
      where: { id },
    });
  } else {
    // 按平台标识符查询
    platform = await prisma.platformConfig.findUnique({
      where: { platformId: id },
    });
  }

  if (!platform) {
    throw createError('NOT_FOUND', '平台配置不存在');
  }

  return {
    ...platform,
    fieldMappings: JSON.parse(platform.fieldMappings),
    apiConfig: platform.apiConfig ? JSON.parse(platform.apiConfig) : null,
  };
}

/**
 * 更新平台配置
 * @param id - 可以是数据库记录ID (UUID) 或平台标识符 (如 'shansong')
 */
export async function updatePlatform(
  id: string,
  params: PlatformConfigParams
): Promise<unknown> {
  // 判断是 UUID 还是平台标识符
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  let platform;
  if (isUuid) {
    // 按 UUID 查询
    platform = await prisma.platformConfig.findUnique({
      where: { id },
    });
  } else {
    // 按平台标识符查询
    platform = await prisma.platformConfig.findUnique({
      where: { platformId: id },
    });
  }

  if (!platform) {
    throw createError('NOT_FOUND', '平台配置不存在');
  }

  // 构建更新数据
  const updateData: Record<string, unknown> = {};

  if (params.name !== undefined) updateData.name = params.name;
  if (params.icon !== undefined) updateData.icon = params.icon;
  if (params.enabled !== undefined) updateData.enabled = params.enabled;
  if (params.tolerance !== undefined) updateData.tolerance = params.tolerance;
  if (params.autoSync !== undefined) updateData.autoSync = params.autoSync;
  if (params.syncInterval !== undefined) updateData.syncInterval = params.syncInterval;
  if (params.fieldMappings !== undefined) {
    updateData.fieldMappings = JSON.stringify(params.fieldMappings);
  }
  if (params.apiConfig !== undefined) {
    updateData.apiConfig = JSON.stringify(params.apiConfig);
  }

  const updated = await prisma.platformConfig.update({
    where: { id: platform.id },  // 使用实际的数据库 ID
    data: updateData,
  });

  return {
    ...updated,
    fieldMappings: JSON.parse(updated.fieldMappings),
    apiConfig: updated.apiConfig ? JSON.parse(updated.apiConfig) : null,
  };
}

/**
 * 初始化平台配置
 */
async function initializePlatforms(): Promise<void> {
  await prisma.platformConfig.createMany({
    data: defaultPlatforms.map((p) => ({
      platformId: p.platformId,
      name: p.name,
      icon: p.icon,
      enabled: p.enabled,
      fieldMappings: JSON.stringify(p.fieldMappings),
      tolerance: p.tolerance,
      autoSync: p.autoSync,
      syncInterval: p.syncInterval,
    })),
  });
}

/**
 * 重置平台配置
 */
export async function resetPlatforms(): Promise<void> {
  // 删除所有现有配置
  await prisma.platformConfig.deleteMany();
  
  // 重新初始化
  await initializePlatforms();
}

/**
 * 触发平台同步
 */
export async function triggerSync(platformId: string): Promise<{ success: boolean; message: string }> {
  const platform = await prisma.platformConfig.findUnique({
    where: { platformId },
  });

  if (!platform) {
    throw createError('NOT_FOUND', '平台配置不存在');
  }

  if (!platform.enabled) {
    throw createError('VALIDATION_ERROR', '该平台已禁用，无法同步');
  }

  // TODO: 实际触发同步逻辑
  // 这里可以调用实际的 API 同步服务
  
  return {
    success: true,
    message: `${platform.name} 同步任务已触发`,
  };
}

/**
 * 获取平台统计信息
 */
export async function getPlatformStats(): Promise<unknown[]> {
  const platforms = await prisma.platformConfig.findMany();

  // 获取每个平台的任务统计
  const stats = await Promise.all(
    platforms.map(async (p: typeof platforms[0]) => {
      const tasks = await prisma.reconciliationTask.findMany({
        where: { platformId: p.platformId },
        select: {
          localOrderCount: true,
          platformOrderCount: true,
          matchedCount: true,
          exceptionCount: true,
          totalAmount: true,
          matchedAmount: true,
        },
      });

      const totalOrders = tasks.reduce((sum: number, t: typeof tasks[0]) => sum + t.localOrderCount + t.platformOrderCount, 0);
      const totalTasks = tasks.length;

      return {
        platformId: p.platformId,
        name: p.name,
        icon: p.icon,
        enabled: p.enabled,
        totalTasks,
        totalOrders,
      };
    })
  );

  return stats;
}
