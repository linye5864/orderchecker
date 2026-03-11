/**
 * 对账核心引擎服务
 * 实现 Python 版本的对账逻辑，包括：
 * - 配送单汇总分析
 * - 三方订单匹配和对账
 * - 流水对账
 * - 异常检测
 * - 任务取消支持
 * - 进度实时推送
 */

import { createError } from '../utils/error.js';
import {
  getPlatformAdapter,
  parseExcel,
  parseCSV,
  parseAmount,
  cleanOrderNumber,
  calculateMatchRate,
  type DeliveryOrder,
  type PlatformOrder,
  type FlowOrder,
} from './file-parser.service.js';
import { getFileById, createReconciliationTask, updateReconciliationTask, createReconciliationResult, getReconciliationTaskById } from '../lib/sqlite.js';
import fs from 'fs/promises';

// ==================== 任务取消状态管理 ====================

/**
 * 任务取消状态存储
 */
const taskCancellationStatus = new Map<string, boolean>();

/**
 * 任务进度存储（用于 WebSocket 推送）
 */
const taskProgressStore = new Map<string, { progress: number; message: string; status: string }>();

/**
 * 设置任务取消状态
 */
export function setTaskCancellation(taskId: string, cancelled: boolean): void {
  taskCancellationStatus.set(taskId, cancelled);
}

/**
 * 检查任务是否已取消
 */
export function isTaskCancelled(taskId: string): boolean {
  return taskCancellationStatus.get(taskId) === true;
}

/**
 * 获取任务进度
 */
export function getTaskProgress(taskId: string): { progress: number; message: string; status: string } | null {
  return taskProgressStore.get(taskId) || null;
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(taskId: string, progress: number, message: string, status: string = 'PROCESSING'): void {
  taskProgressStore.set(taskId, { progress, message, status });
}

/**
 * 清除任务状态
 */
export function clearTaskStatus(taskId: string): void {
  taskCancellationStatus.delete(taskId);
  taskProgressStore.delete(taskId);
}

// ==================== 数据模型 ====================

/**
 * 对账结果明细
 */
export interface ReconciliationDetail {
  orderNumber: string;           // 配送单订单号
  platformOrderNumber: string;   // 平台订单号
  status: 'MATCHED' | 'EXCEPTION' | 'MISSING'; // 匹配状态
  localAmount: number;           // 配送单金额
  platformAmount: number;        // 平台账单金额
  fundAmount?: number;           // 流水扣款金额（可选）
  amountDiff: number;            // 金额差
  fundDiff?: number;             // 配送 vs 流水差异（可选）
  localStatus: string;           // 本地配送状态
  platformStatus: string;        // 平台订单状态
  reason?: string;               // 异常原因
  createdAt?: Date;              // 下单时间
}

/**
 * 对账汇总结果
 */
export interface ReconciliationSummary {
  totalOrders: number;           // 总订单数
  matchedOrders: number;         // 匹配成功数
  exceptionOrders: number;       // 异常订单数
  missingOrders: number;         // 缺失订单数
  perfectMatches: number;        // 完全匹配（金额完全一致）
  toleranceMatches: number;      // 容差匹配（金额差异在容差范围内）
  totalLocalAmount: number;      // 配送单总金额
  totalPlatformAmount: number;   // 平台账单总金额
  totalMatchedAmount: number;    // 匹配金额总和
  amountDiff: number;            // 总金额差
  matchRate: number;             // 匹配率
  details: ReconciliationDetail[]; // 详细结果
}

/**
 * 流水对账结果
 */
export interface FlowReconciliationSummary {
  adminId: string;               // 商户号
  newCustomerReward: number;     // 新客奖励
  rechargeAmount: number;        // 充值金额
  deductionAmount: number;       // 扣款金额
  expectedBalance: number;       // 预期余额变化
  orderDetails: {
    orderId: string;
    platform: string;
    amount: number;
    status: string;
  }[];
}

/**
 * 对账任务执行参数
 */
export interface ExecuteReconciliationParams {
  taskId: string;
  localFileId: string;
  platformFileId: string;
  flowFileId?: string;
  platformId: string;
  tolerance?: number;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 进度更新回调（支持取消检查）
 */
function createProgressCallback(taskId: string, onProgress?: (progress: number, message: string) => void): (progress: number, message: string) => void {
  return (progress: number, message: string) => {
    // 更新进度存储
    updateTaskProgress(taskId, progress, message);
    
    // 调用原始回调
    onProgress?.(progress, message);
    
    // 检查是否已取消
    if (isTaskCancelled(taskId)) {
      throw createError('CANCELLED', '任务已取消');
    }
  };
}

// ==================== 数据兼容映射（真实文件格式） ====================

function mapDeliveryIdToPlatformId(deliveryId: unknown): string {
  const idNum = typeof deliveryId === 'number' ? deliveryId : parseInt(String(deliveryId || ''), 10);
  // Based on matching analysis against current `data/*.xlsx`
  switch (idNum) {
    case 1:
      return 'dada';
    case 2:
      return 'uu';
    case 3:
      return 'xunfeng';
    case 4:
      return 'fengniao';
    case 6:
      return 'shansong';
    case 12:
      return 'guoxiaodi';
    case 14:
      return 'xunfeng-c';
    default:
      return 'unknown';
  }
}

function mapNumericDeliveryStatus(status: unknown): string {
  const code = typeof status === 'number' ? status : parseInt(String(status || ''), 10);
  // Best-effort mapping for exported delivery files
  switch (code) {
    case 3:
      return '配送完成';
    case 4:
      return '已取消';
    case 5:
      return '配送异常';
    default:
      return String(status ?? '');
  }
}

// ==================== 核心对账引擎 ====================

/**
 * 执行对账任务
 */
export async function executeReconciliation(
  params: ExecuteReconciliationParams
): Promise<ReconciliationSummary> {
  const { taskId, localFileId, platformFileId, flowFileId, platformId, tolerance = 0.01, onProgress } = params;

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw createError('CANCELLED', '任务已取消');
  }

  // 获取文件
  const [localFile, platformFile] = await Promise.all([
    getFileById(localFileId),
    getFileById(platformFileId),
  ]);

  if (!localFile || !platformFile) {
    throw createError('NOT_FOUND', '文件不存在');
  }

  // 初始化进度
  const progressCallback = createProgressCallback(taskId, onProgress);
  progressCallback(5, '正在读取文件...');

  console.log(`[REC] 开始解析文件`);
  console.log(`[REC] localFileId: ${localFileId}, filePath: ${localFile.filePath}`);
  console.log(`[REC] platformFileId: ${platformFileId}, filePath: ${platformFile.filePath}`);
  if (flowFileId) {
    console.log(`[REC] flowFileId: ${flowFileId}`);
  }

  // 解析文件
  const [localOrders, platformOrders, flowOrders] = await Promise.all([
    parseDeliveryOrders(localFile.filePath, taskId, progressCallback),
    parsePlatformOrders(platformFile.filePath, platformId, taskId, progressCallback),
    flowFileId ? parseFlowOrders((await getFileById(flowFileId))?.filePath || '', taskId, progressCallback) : Promise.resolve([]),
  ]);

  console.log(`[REC] 解析结果: localOrders=${localOrders.length}, platformOrders=${platformOrders.length}, flowOrders=${flowOrders.length}`);
  console.log(`[REC] localOrders 前3条:`, localOrders.slice(0, 3));
  console.log(`[REC] platformOrders 前3条:`, platformOrders.slice(0, 3));

  progressCallback(20, '正在解析订单数据...');

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw createError('CANCELLED', '任务已取消');
  }

  if (localOrders.length === 0) {
    throw createError('VALIDATION_ERROR', '配送单数据为空');
  }

  if (platformOrders.length === 0) {
    throw createError('VALIDATION_ERROR', '平台账单数据为空');
  }

  // 执行对账
  const result = await compareOrders(
    localOrders,
    platformOrders,
    flowOrders,
    platformId,
    tolerance,
    taskId,
    progressCallback
  );

  progressCallback(80, '正在生成报告...');

  // 计算总金额
  const totalLocalAmount = result.details.reduce((sum, d) => sum + d.localAmount, 0);
  const totalPlatformAmount = result.details.reduce((sum, d) => sum + d.platformAmount, 0);

  // 更新任务状态
  await updateReconciliationTask(taskId, {
    status: 'COMPLETED',
    progress: 100,
    localOrderCount: result.totalOrders,
    platformOrderCount: platformOrders.length,
    matchedCount: result.matchedOrders,
    exceptionCount: result.exceptionOrders + result.missingOrders,
    totalAmount: totalLocalAmount,
    matchedAmount: result.totalMatchedAmount,
    completedAt: new Date(),
  });

  // 更新最终进度
  updateTaskProgress(taskId, 100, '对账完成', 'COMPLETED');

  // 保存对账结果
  await createReconciliationResult({
    id: `${taskId}-result`,
    taskId,
    totalOrders: result.totalOrders,
    matchedOrders: result.matchedOrders,
    exceptionOrders: result.exceptionOrders,
    perfectMatches: result.perfectMatches,
    toleranceMatches: result.toleranceMatches,
    totalLocalAmount,
    totalPlatformAmount,
    totalMatchedAmount: result.totalMatchedAmount,
    matchRate: result.matchRate,
    amountDiff: result.amountDiff,
    orders: JSON.stringify(result.details),
  });

  // 清理任务状态
  clearTaskStatus(taskId);

  return {
    totalOrders: result.totalOrders,
    matchedOrders: result.matchedOrders,
    exceptionOrders: result.exceptionOrders,
    missingOrders: result.missingOrders,
    perfectMatches: result.perfectMatches,
    toleranceMatches: result.toleranceMatches,
    totalLocalAmount,
    totalPlatformAmount,
    totalMatchedAmount: result.totalMatchedAmount,
    amountDiff: result.amountDiff,
    matchRate: result.matchRate,
    details: result.details,
  };
}

/**
 * 解析配送单文件
 */
async function parseDeliveryOrders(
  filePath: string,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<DeliveryOrder[]> {
  console.log(`[REC] parseDeliveryOrders: 读取文件 ${filePath}`);

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw createError('CANCELLED', '任务已取消');
  }

  const buffer = await fs.readFile(filePath);
  
  // 首先尝试用 headerRow: 1 解析
  let result = parseExcel<any>(buffer, { headerRow: 1 });
  
  // 如果解析失败或列名是数字，尝试不用 header
  if (!result.success || !result.data || result.data.length === 0) {
    result = parseExcel<any>(buffer, {});
  }
  
  console.log(`[REC] parseDeliveryOrders: parseExcel success=${result.success}, data.length=${result.data?.length || 0}`);

  if (!result.success || !result.data) {
    return [];
  }

  // 显示前几行的列名
  if (result.data.length > 0) {
    const columns = Object.keys(result.data[0]);
    console.log(`[REC] parseDeliveryOrders: 列名=${columns.slice(0, 10).join(', ')}`);
    
    // 检测是否为数字列名（无表头情况）
    const isNumericColumns = columns.every(col => /^\d+$/.test(col));
    console.log(`[REC] parseDeliveryOrders: isNumericColumns=${isNumericColumns}`);
    
    if (isNumericColumns) {
      // 无表头情况：根据位置映射字段
      // 假设列顺序为：配送单订单号, 发单运力, 配送状态, delivery_channel, free, 下单时间
      return result.data
        .map((row: any) => {
          const values = Object.values(row);
          const deliveryOrderSn = String(values[0] || '');
          const freeValue = values[4];
          
          // 只保留有订单号和金额的行
          if (!deliveryOrderSn || freeValue === undefined || freeValue === null || freeValue === '') {
            return null;
          }
          
          // 处理时间字段
          let createdAt: Date | undefined;
          if (values[5]) {
            try {
              const dateVal = values[5];
              if (typeof dateVal === 'string' || typeof dateVal === 'number') {
                createdAt = new Date(dateVal);
              } else if (dateVal instanceof Date) {
                createdAt = dateVal;
              }
            } catch {
              // 忽略无效日期
            }
          }
          
          return {
            deliveryOrderSn: cleanOrderNumber(deliveryOrderSn),
            deliveryPlatform: String(values[1] || ''),
            deliveryStatus: String(values[2] || ''),
            deliveryChannel: parseInt(String(values[3] || 0)),
            free: parseAmount(freeValue),
            createdAt,
          };
        })
        .filter((order: DeliveryOrder | null) => order !== null && order.deliveryOrderSn);
    }
  }

  // 正常情况：有表头
  const sample = result.data[0] || {};
  const hasExportedColumns = Object.prototype.hasOwnProperty.call(sample, 'delivery_order_sn') ||
    Object.prototype.hasOwnProperty.call(sample, 'delivery_id') ||
    Object.prototype.hasOwnProperty.call(sample, 'platform_order_id');

  if (hasExportedColumns) {
    const filtered = result.data.filter((row) => row['delivery_order_sn'] && row['free'] !== undefined);
    console.log(`[REC] parseDeliveryOrders: 检测到导出格式列名，过滤后数量=${filtered.length}`);
    return filtered.map((row) => ({
      deliveryOrderSn: cleanOrderNumber(String(row['delivery_order_sn'] || '')),
      deliveryPlatform: mapDeliveryIdToPlatformId(row['delivery_id']),
      deliveryStatus: mapNumericDeliveryStatus(row['status']),
      deliveryChannel: parseInt(String(row['delivery_channel'] ?? 0), 10) || 0,
      free: parseAmount(row['free']),
      adminId: row['admin_id'] !== undefined && row['admin_id'] !== null ? String(row['admin_id']) : undefined,
      platformOrderId: row['platform_order_id'] ? cleanOrderNumber(String(row['platform_order_id'])) : undefined,
      deliveryId: row['delivery_id'] !== undefined && row['delivery_id'] !== null ? String(row['delivery_id']) : undefined,
      createdAt: row['create_time'] ? new Date(row['create_time']) : undefined,
    }));
  }

  const filtered = result.data.filter((row) => row['配送单订单号'] && row['free'] !== undefined);
  console.log(`[REC] parseDeliveryOrders: 过滤后数量=${filtered.length}`);
  return filtered.map((row) => ({
    deliveryOrderSn: cleanOrderNumber(row['配送单订单号'] || ''),
    deliveryPlatform: row['发单运力'] || '',
    deliveryStatus: row['配送状态'] || '',
    deliveryChannel: parseInt(row['delivery_channel'] || 0),
    free: parseAmount(row['free']),
    adminId: row['admin_id'] !== undefined && row['admin_id'] !== null ? String(row['admin_id']) : undefined,
    platformOrderId: row['platform_order_id'] ? cleanOrderNumber(String(row['platform_order_id'])) : undefined,
    createdAt: row['下单时间'] ? new Date(row['下单时间']) : undefined,
  }));
}

/**
 * 解析平台订单文件
 */
async function parsePlatformOrders(
  filePath: string,
  platformId: string,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<PlatformOrder[]> {
  console.log(`[REC] parsePlatformOrders: 读取文件 ${filePath}, platformId=${platformId}`);

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw createError('CANCELLED', '任务已取消');
  }

  const buffer = await fs.readFile(filePath);

  // 根据平台获取解析选项
  const adapter = getPlatformAdapter(platformId);
  console.log(`[REC] parsePlatformOrders: adapter.platformId=${adapter.platformId}`);

  // 首先尝试指定 sheet 的解析
  let result;
  let parseOptions;
  
  if (adapter.platformId === 'shansong') {
    // 闪送平台：尝试"订单明细" sheet
    parseOptions = { sheetName: '订单明细' };
    result = parseExcel<any>(buffer, parseOptions);
    
    // 如果失败，回退到第一个 sheet
    if (!result.success || !result.data || result.data.length === 0) {
      console.log(`[REC] parsePlatformOrders: "订单明细" sheet 不存在或为空，尝试第一个 sheet`);
      parseOptions = {};
      result = parseExcel<any>(buffer, parseOptions);
    }
  } else if (adapter.platformId === 'dada') {
    // 达达平台：sheet 名通常为 "1"
    parseOptions = { sheetName: '1' };
    result = parseExcel<any>(buffer, parseOptions);
    if (!result.success || !result.data || result.data.length === 0) {
      parseOptions = {};
      result = parseExcel<any>(buffer, parseOptions);
    }
  } else {
    parseOptions = {};
    result = parseExcel<any>(buffer, parseOptions);
  }

  console.log(`[REC] parsePlatformOrders: parseExcel success=${result.success}, data.length=${result.data?.length || 0}`);

  if (!result.success || !result.data) {
    return [];
  }

  // 显示前几行的列名
  if (result.data.length > 0) {
    const columns = Object.keys(result.data[0]);
    console.log(`[REC] parsePlatformOrders: 列名=${columns.slice(0, 10).join(', ')}`);
    
    // 检测是否为数字列名（无表头情况）
    const isNumericColumns = columns.every(col => /^\d+$/.test(col));
    console.log(`[REC] parsePlatformOrders: isNumericColumns=${isNumericColumns}`);
    
    if (isNumericColumns) {
      // 无表头情况：根据位置映射字段
      // 闪送平台列顺序：三方订单编号, 订单编号, 订单状态, 实付金额(元), 取消单扣款金额(元)
      return result.data
        .map((row: any) => {
          const values = Object.values(row);
          const orderNumber = String(values[1] || '');
          
          if (!orderNumber) {
            return null;
          }
          
          return {
            thirdPartyOrderNumber: cleanOrderNumber(String(values[0] || '')),
            orderNumber: orderNumber,
            orderStatus: String(values[2] || ''),
            paidAmount: parseAmount(values[3]),
            cancelDeductionAmount: parseAmount(values[4]),
            createdAt: undefined,
          };
        })
        .filter((order: PlatformOrder | null) => order !== null && order.orderNumber);
    }
  }

  // 正常情况：有表头
  // 根据平台使用不同的字段名（匹配 root `data/*.xlsx` 的真实格式）
  const fieldMap = adapter.platformId === 'shansong' ? {
    thirdPartyOrderNumber: '三方订单编号',
    orderNumber: '订单编号',
    orderStatus: '订单状态',
    paidAmount: '实付金额(元)',
    cancelDeductionAmount: '取消单扣款金额(元)',
  } : adapter.platformId === 'dada' ? {
    thirdPartyOrderNumber: '第三方订单ID',
    orderNumber: '达达订单ID',
    orderStatus: '订单状态',
    paidAmount: '运费账户消耗',
    cancelDeductionAmount: '违约金',
  } : adapter.platformId === 'fengniao' ? {
    thirdPartyOrderNumber: '商家订单号',
    orderNumber: '蜂鸟订单号',
    orderStatus: '订单状态',
    paidAmount: '配送费总金额',
    cancelDeductionAmount: '',
  } : adapter.platformId === 'xunfeng' ? {
    thirdPartyOrderNumber: '商家订单号',
    orderNumber: '顺丰订单号',
    orderStatus: '订单状态',
    paidAmount: '配送费总价(单位元)',
    cancelDeductionAmount: '订单取消费(单位元)',
  } : adapter.platformId === 'xunfeng-c' ? {
    thirdPartyOrderNumber: '同城运单号',
    orderNumber: '订单号',
    orderStatus: '订单状态',
    paidAmount: '支付金额',
    cancelDeductionAmount: '取消单扣费',
  } : adapter.platformId === 'uu' ? {
    thirdPartyOrderNumber: '三方订单号',
    orderNumber: 'UU订单号',
    orderStatus: '订单状态',
    paidAmount: '实际支付金额',
    cancelDeductionAmount: '上门费',
  } : adapter.platformId === 'guoxiaodi' ? {
    thirdPartyOrderNumber: '订单号',
    orderNumber: '订单号',
    orderStatus: '订单状态',
    paidAmount: '支付金额',
    cancelDeductionAmount: '取消订单扣款',
  } : {
    thirdPartyOrderNumber: '三方订单编号',
    orderNumber: '订单编号',
    orderStatus: '订单状态',
    paidAmount: '实付金额(元)',
    cancelDeductionAmount: '取消单扣款金额(元)',
  };

  const filtered = result.data
    .filter((row) => row[fieldMap.orderNumber]);

  console.log(`[REC] parsePlatformOrders: fieldMap=${JSON.stringify(fieldMap)}, 过滤后数量=${filtered.length}`);

  return filtered
    .map((row) => ({
      thirdPartyOrderNumber: cleanOrderNumber(row[fieldMap.thirdPartyOrderNumber] || ''),
      orderNumber: row[fieldMap.orderNumber] || '',
      orderStatus: row[fieldMap.orderStatus] || '',
      paidAmount: parseAmount(row[fieldMap.paidAmount]),
      cancelDeductionAmount: fieldMap.cancelDeductionAmount ? parseAmount(row[fieldMap.cancelDeductionAmount]) : 0,
      createdAt: row['下单时间'] ? new Date(row['下单时间']) : undefined,
    }));
}

/**
 * 解析流水订单文件
 */
async function parseFlowOrders(
  filePath: string,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<FlowOrder[]> {
  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw createError('CANCELLED', '任务已取消');
  }

  if (!filePath) {
    return [];
  }

  const buffer = await fs.readFile(filePath);
  let result = parseExcel<any>(buffer, { headerRow: 1 });
  if (!result.success || !result.data || result.data.length === 0) {
    result = parseExcel<any>(buffer, {});
  }

  if (!result.success || !result.data) {
    return [];
  }

  const sample = result.data[0] || {};
  const hasExportedColumns = Object.prototype.hasOwnProperty.call(sample, 'admin_id') &&
    (Object.prototype.hasOwnProperty.call(sample, 'delivery_order_id') || Object.prototype.hasOwnProperty.call(sample, 'order_sn'));

  if (hasExportedColumns) {
    return result.data
      .filter((row) => row['admin_id'])
      .map((row) => {
        const unix = row['createtime'];
        const fromUnix = row['FROM_UNIXTIME(createtime)'];
        let createdAt: Date | undefined;
        if (fromUnix) {
          createdAt = new Date(fromUnix);
        } else if (typeof unix === 'number' && Number.isFinite(unix)) {
          createdAt = new Date(unix * 1000);
        } else if (unix) {
          const parsed = parseInt(String(unix), 10);
          if (!Number.isNaN(parsed)) createdAt = new Date(parsed * 1000);
        }

        return {
          adminId: String(row['admin_id']),
          type: parseInt(row['type'] || 0),
          method: parseInt(row['method'] || 0),
          money: parseAmount(row['money']),
          deliveryOrderId: row['delivery_order_id'] ? cleanOrderNumber(String(row['delivery_order_id'])) : undefined,
          createdAt,
        };
      });
  }

  return result.data
    .filter((row) => row['admin_id'])
    .map((row) => ({
      adminId: String(row['admin_id']),
      type: parseInt(row['type'] || 0),
      method: parseInt(row['method'] || 0),
      money: parseAmount(row['money']),
      deliveryOrderId: row['delivery_order_id'] || undefined,
      createdAt: row['create_time'] ? new Date(row['create_time']) : undefined,
    }));
}

/**
 * 核心对账逻辑（对应 Python 的 compare_data 方法）
 */
async function compareOrders(
  localOrders: DeliveryOrder[],
  platformOrders: PlatformOrder[],
  flowOrders: FlowOrder[],
  platformId: string,
  tolerance: number,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<{
  totalOrders: number;
  matchedOrders: number;
  exceptionOrders: number;
  missingOrders: number;
  perfectMatches: number;
  toleranceMatches: number;
  totalMatchedAmount: number;
  amountDiff: number;
  matchRate: number;
  details: ReconciliationDetail[];
}> {
  const adapter = getPlatformAdapter(platformId);
  const platformOrderMap = new Map<string, PlatformOrder>();

  const toCents = (amount: number): number => Math.round((Number.isFinite(amount) ? amount : 0) * 100);
  const centsToAmount = (cents: number): number => Math.round(cents) / 100;

  const isLocalOrderForPlatform = (o: DeliveryOrder): boolean => {
    const p = String(o.deliveryPlatform || '').trim();
    if (!p) return false;
    if (p === platformId) return true;
    if (p === adapter.platformName) return true;
    // Fallback: exported delivery_id mapping stored in `deliveryId`
    if (o.deliveryId && mapDeliveryIdToPlatformId(o.deliveryId) === platformId) return true;
    return false;
  };

  // 构建平台订单索引
  for (const order of platformOrders) {
    const key = cleanOrderNumber(order.thirdPartyOrderNumber);
    platformOrderMap.set(key, order);
  }

  // 构建流水扣款索引: (adminId, deliveryOrderSn) -> abs(sum(money[type==1]))
  const flowMoneySumCents = new Map<string, number>();
  for (const record of flowOrders) {
    if (!record.adminId || !record.deliveryOrderId) continue;
    if (record.type !== 1) continue;
    const k = `${record.adminId}|${cleanOrderNumber(record.deliveryOrderId)}`;
    flowMoneySumCents.set(k, (flowMoneySumCents.get(k) || 0) + toCents(record.money));
  }

  const details: ReconciliationDetail[] = [];
  let matchedCount = 0;
  let exceptionCount = 0;
  let missingCount = 0;
  let perfectMatches = 0;
  let toleranceMatches = 0;
  let totalMatchedAmount = 0;
  let totalDiff = 0;

  const platformLocalOrders = localOrders.filter((o) => isLocalOrderForPlatform(o) && o.deliveryChannel === 0);
  const completedLocalOrders = platformLocalOrders.filter((o) => o.deliveryStatus === '配送完成');
  // Prefer strict completed-only set (as in docs); if empty, fall back to channel-only to keep real files usable.
  const validLocalOrders = completedLocalOrders.length > 0 ? completedLocalOrders : platformLocalOrders;

  const total = validLocalOrders.length;
  let processed = 0;

  for (const localOrder of validLocalOrders) {
    processed++;
    
    // 检查是否已取消
    if (isTaskCancelled(taskId)) {
      throw createError('CANCELLED', '任务已取消');
    }

    if (processed % 50 === 0 || processed === total) {
      const progress = (processed / total) * 100;
      onProgress?.(progress, `正在对账 ${processed}/${total}`);
    }

    const matchKey = cleanOrderNumber(adapter.getMatchKey(localOrder));
    const platformOrder = platformOrderMap.get(matchKey);

    if (!platformOrder) {
      // 平台订单缺失
      missingCount++;
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: '',
        status: 'MISSING',
        localAmount: localOrder.free,
        platformAmount: 0,
        fundAmount: undefined,
        amountDiff: -localOrder.free,
        fundDiff: undefined,
        localStatus: localOrder.deliveryStatus,
        platformStatus: '',
        reason: '平台账单中未找到该订单',
        createdAt: localOrder.createdAt,
      });
      continue;
    }

    // 获取实际扣款金额
    const platformActualAmount = adapter.getActualDeduction(platformOrder);
    const amountDiff = centsToAmount(toCents(platformActualAmount) - toCents(localOrder.free));

    // 获取流水扣款金额（可选）
    let fundAmount: number | undefined;
    let fundDiff: number | undefined;
    const adminId = localOrder.adminId;
    if (flowOrders.length > 0 && adminId) {
      const fk = `${adminId}|${cleanOrderNumber(localOrder.deliveryOrderSn)}`;
      if (flowMoneySumCents.has(fk)) {
        const absCents = Math.abs(flowMoneySumCents.get(fk) || 0);
        fundAmount = centsToAmount(absCents);
        fundDiff = centsToAmount(toCents(localOrder.free) - absCents);
      } else {
        // 流水缺失
        missingCount++;
        details.push({
          orderNumber: localOrder.deliveryOrderSn,
          platformOrderNumber: platformOrder.orderNumber,
          status: 'MISSING',
          localAmount: localOrder.free,
          platformAmount: platformActualAmount,
          fundAmount: 0,
          amountDiff,
          fundDiff: localOrder.free,
          localStatus: localOrder.deliveryStatus,
          platformStatus: platformOrder.orderStatus,
          reason: '流水账单中未找到该订单',
          createdAt: localOrder.createdAt,
        });
        continue;
      }
    }

    const deliveryCents = toCents(localOrder.free);
    const platformCents = toCents(platformActualAmount);
    const fundCents = fundAmount === undefined ? undefined : toCents(fundAmount);

    const isTwoWayMatched = deliveryCents === platformCents;
    const isThreeWayMatched = fundCents === undefined ? isTwoWayMatched : (isTwoWayMatched && platformCents === fundCents);

    if (isThreeWayMatched) {
      matchedCount++;
      perfectMatches++;
      totalMatchedAmount += localOrder.free;
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: platformOrder.orderNumber,
        status: 'MATCHED',
        localAmount: centsToAmount(deliveryCents),
        platformAmount: centsToAmount(platformCents),
        fundAmount: fundAmount,
        amountDiff: 0,
        fundDiff: fundCents === undefined ? undefined : centsToAmount(deliveryCents - fundCents),
        localStatus: localOrder.deliveryStatus,
        platformStatus: platformOrder.orderStatus,
        createdAt: localOrder.createdAt,
      });
      continue;
    }

    // Mismatch
    exceptionCount++;
    totalDiff += amountDiff;

    // Extra metric: within-tolerance delta between delivery and platform
    if (Math.abs(centsToAmount(platformCents - deliveryCents)) <= tolerance) {
      toleranceMatches++;
    }

    let reason = '所有平台金额不匹配';
    if (deliveryCents !== platformCents) {
      const diff = centsToAmount(deliveryCents - platformCents);
      reason = diff > 0 ? `快小象平台少扣'${Math.abs(diff).toFixed(2)}'元` : `快小象平台多扣'${Math.abs(diff).toFixed(2)}'元`;
    } else if (fundCents !== undefined && deliveryCents !== fundCents) {
      const diff = centsToAmount(deliveryCents - fundCents);
      reason = diff > 0 ? `商户流水少扣'${Math.abs(diff).toFixed(2)}'元` : `商户流水多扣'${Math.abs(diff).toFixed(2)}'元`;
    }

    details.push({
      orderNumber: localOrder.deliveryOrderSn,
      platformOrderNumber: platformOrder.orderNumber,
      status: 'EXCEPTION',
      localAmount: centsToAmount(deliveryCents),
      platformAmount: centsToAmount(platformCents),
      fundAmount,
      amountDiff: centsToAmount(platformCents - deliveryCents),
      fundDiff: fundCents === undefined ? undefined : centsToAmount(deliveryCents - fundCents),
      localStatus: localOrder.deliveryStatus,
      platformStatus: platformOrder.orderStatus,
      reason,
      createdAt: localOrder.createdAt,
    });
  }

  // 计算匹配率
  const matchRate = calculateMatchRate(matchedCount, total);

  return {
    totalOrders: total,
    matchedOrders: matchedCount,
    exceptionOrders: exceptionCount,
    missingOrders: missingCount,
    perfectMatches,
    toleranceMatches,
    totalMatchedAmount,
    amountDiff: totalDiff,
    matchRate,
    details,
  };
}

/**
 * 流水对账（对应 Python 的 local_compare 方法）
 */
export async function reconcileFlow(
  localOrders: DeliveryOrder[],
  flowOrders: FlowOrder[],
  onProgress?: (message: string) => void
): Promise<FlowReconciliationSummary[]> {
  const results: FlowReconciliationSummary[] = [];

  // 获取去重的商户号
  const adminIds = [...new Set(flowOrders.map((o) => o.adminId))];

  for (const adminId of adminIds) {
    onProgress?.(`正在对账商户 ${adminId}...`);

    const adminFlowData = flowOrders.filter((o) => o.adminId === adminId);

    // 计算流水汇总
    const newCustomerReward = adminFlowData
      .filter((o) => o.type === 2 && o.method === 3)
      .reduce((sum, o) => sum + o.money, 0);

    const rechargeAmount = adminFlowData
      .filter((o) => o.type === 2 && [1, 2].includes(o.method))
      .reduce((sum, o) => sum + o.money, 0);

    const deductionAmount = Math.abs(
      adminFlowData.filter((o) => o.type === 1).reduce((sum, o) => sum + o.money, 0)
    );

    // 获取该商户的订单明细
    const orderDetails: FlowReconciliationSummary['orderDetails'] = [];
    const uniqueOrderIds = [
      ...new Set(
        adminFlowData
          .filter((o) => o.deliveryOrderId)
          .map((o) => o.deliveryOrderId)
      ),
    ];

    for (const orderId of uniqueOrderIds) {
      if (!orderId) continue;

      const deliveryData = localOrders.find(
        (o) => o.deliveryOrderSn === orderId && o.deliveryStatus === '配送完成'
      );

      if (deliveryData) {
        orderDetails.push({
          orderId,
          platform: deliveryData.deliveryPlatform,
          amount: deliveryData.free,
          status: deliveryData.deliveryStatus,
        });
      }
    }

    const orderTotalAmount = orderDetails.reduce((sum, o) => sum + o.amount, 0);
    const expectedBalance = newCustomerReward + rechargeAmount - orderTotalAmount;
    const balanceDiff = expectedBalance - deductionAmount;

    results.push({
      adminId,
      newCustomerReward,
      rechargeAmount,
      deductionAmount,
      expectedBalance: balanceDiff,
      orderDetails,
    });
  }

  return results;
}

/**
 * 配送单平台汇总（对应 Python 的 check_distribution_orders 方法）
 */
export function summarizePlatformOrders(localOrders: DeliveryOrder[]): {
  platform: string;
  orderCount: number;
  totalAmount: number;
}[] {
  const platformMap = new Map<string, { count: number; amount: number }>();

  for (const order of localOrders) {
    if (order.deliveryStatus === '配送完成' && order.deliveryChannel === 0) {
      const platform = order.deliveryPlatform || '未知';
      const existing = platformMap.get(platform) || { count: 0, amount: 0 };
      platformMap.set(platform, {
        count: existing.count + 1,
        amount: existing.amount + order.free,
      });
    }
  }

  return [...platformMap.entries()]
    .map(([platform, data]) => ({
      platform,
      orderCount: data.count,
      totalAmount: Math.round(data.amount * 100) / 100,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * 取消订单统计
 */
export function getCancelledOrders(localOrders: DeliveryOrder[]): {
  platform: string;
  cancelledCount: number;
}[] {
  const cancelledByPlatform = new Map<string, number>();

  for (const order of localOrders) {
    if (order.deliveryStatus === '配送取消') {
      const platform = order.deliveryPlatform || '未知';
      cancelledByPlatform.set(platform, (cancelledByPlatform.get(platform) || 0) + 1);
    }
  }

  return [...cancelledByPlatform.entries()].map(([platform, count]) => ({
    platform,
    cancelledCount: count,
  }));
}

// ==================== 测试模式（直接使用文件路径） ====================

export interface SyncExecuteParams {
  taskId: string;
  localFilePath: string;
  platformFilePath: string;
  platformId: string;
  flowFilePath?: string;
  tolerance?: number;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 同步执行对账任务（测试模式）
 * 直接使用文件路径，不需要先上传文件
 */
export async function executeReconciliationSync(
  params: SyncExecuteParams
): Promise<ReconciliationSummary> {
  const { taskId, localFilePath, platformFilePath, flowFilePath, platformId, tolerance = 0.01, onProgress } = params;

  console.log(`[TEST-REC] 开始解析文件`);
  console.log(`[TEST-REC] localFilePath: ${localFilePath}`);
  console.log(`[TEST-REC] platformFilePath: ${platformFilePath}`);
  if (flowFilePath) {
    console.log(`[TEST-REC] flowFilePath: ${flowFilePath}`);
  }

  // 更新进度
  onProgress?.(5, '正在读取文件...');

  // 检查文件是否存在
  try {
    await fs.access(localFilePath);
    await fs.access(platformFilePath);
    if (flowFilePath) {
      await fs.access(flowFilePath);
    }
  } catch (error) {
    throw createError('NOT_FOUND', '文件不存在，请检查文件路径是否正确');
  }

  // 解析文件
  const [localOrders, platformOrders, flowOrders] = await Promise.all([
    parseDeliveryOrders(localFilePath, taskId, onProgress),
    parsePlatformOrders(platformFilePath, platformId, taskId, onProgress),
    flowFilePath ? parseFlowOrders(flowFilePath, taskId, onProgress) : Promise.resolve([]),
  ]);

  console.log(`[TEST-REC] 解析结果: localOrders=${localOrders.length}, platformOrders=${platformOrders.length}, flowOrders=${flowOrders.length}`);
  console.log(`[TEST-REC] localOrders 前3条:`, localOrders.slice(0, 3));
  console.log(`[TEST-REC] platformOrders 前3条:`, platformOrders.slice(0, 3));

  // 更新进度
  onProgress?.(20, '正在解析订单数据...');

  if (localOrders.length === 0) {
    throw createError('VALIDATION_ERROR', `配送单数据为空。可能原因：1) 文件没有表头行；2) 列名不匹配（期望: 配送单订单号, 发单运力, 配送状态, free, 下单时间）；3) 文件格式不正确。请检查文件格式。`);
  }

  if (platformOrders.length === 0) {
    throw createError('VALIDATION_ERROR', `平台账单数据为空。可能原因：1) 文件没有表头行；2) 列名不匹配（期望: 订单编号, 三方订单编号, 订单状态, 实付金额(元), 取消单扣款金额(元)）；3) 文件格式不正确。请检查文件格式。`);
  }

  // 执行对账
  const result = await compareOrders(
    localOrders,
    platformOrders,
    flowOrders,
    platformId,
    tolerance,
    taskId,
    onProgress
  );

  onProgress?.(80, '正在生成报告...');

  // 计算总金额
  const totalLocalAmount = result.details.reduce((sum, d) => sum + d.localAmount, 0);
  const totalPlatformAmount = result.details.reduce((sum, d) => sum + d.platformAmount, 0);

  onProgress?.(100, '对账完成');

  return {
    totalOrders: result.totalOrders,
    matchedOrders: result.matchedOrders,
    exceptionOrders: result.exceptionOrders,
    missingOrders: result.missingOrders,
    perfectMatches: result.perfectMatches,
    toleranceMatches: result.toleranceMatches,
    totalLocalAmount,
    totalPlatformAmount,
    totalMatchedAmount: result.totalMatchedAmount,
    amountDiff: result.amountDiff,
    matchRate: result.matchRate,
    details: result.details,
  };
}
